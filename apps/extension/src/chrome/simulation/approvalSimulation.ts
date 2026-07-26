import type { PublicClient } from "viem";

import {
  allowancePairKey,
  decodeAllowanceRead,
  encodeAllowanceRead,
  mergeAllowancePairs,
  readAllowancePreStates,
} from "./approvalAllowanceState";
import { discoverApprovalIntentsFromLogs } from "./approvalLogs";
import {
  discoverApprovalIntents,
  type ApprovalIntent,
  type ApprovalSimulationCall,
} from "./approvalIntents";
import { enrichApprovalMetadata } from "./approvalMetadata";
import {
  buildFallbackApprovalChanges,
  projectApprovalChange,
  type AllowanceState,
} from "./approvalProjection";
import { getSimulationClient } from "./client";
import { MAX_SIMULATION_APPROVAL_CHANGES } from "./constants";
import {
  runEthSimulateV1Calls,
  type EthSimulateV1Run,
} from "./ethSimulateClient";
import {
  discoverResidualApprovalCandidates,
} from "./residualApprovalCandidates";
import {
  type TracedResidualApprovalCandidate,
} from "./residualApprovalTrace";
import { projectResidualApprovals } from "./residualApprovalProjection";
import type {
  ApprovalChange,
  ResidualApproval,
} from "./types";

export interface ApprovalProjection {
  approvalChanges: ApprovalChange[];
  residualApprovals: ResidualApproval[];
  approvalDetectionIncomplete: boolean;
  metadataComplete: boolean;
}

interface ApprovalSimulationOptions {
  includeApprovalChanges?: boolean;
  includeResidualApprovals?: boolean;
  tracedResidualCandidates?: TracedResidualApprovalCandidate[];
  traceIncomplete?: boolean;
}

function mergeIntents(
  staticIntents: ApprovalIntent[],
  eventIntents: ApprovalIntent[],
): { intents: ApprovalIntent[]; incomplete: boolean } {
  const byKey = new Map<string, ApprovalIntent>();
  for (const intent of [...staticIntents, ...eventIntents]) {
    const key = allowancePairKey(intent);
    const previous = byKey.get(key);
    byKey.set(key, {
      ...intent,
      order: previous ? Math.min(previous.order, intent.order) : intent.order,
    });
  }
  return {
    intents: Array.from(byKey.values())
      .sort((left, right) => left.order - right.order)
      .slice(0, MAX_SIMULATION_APPROVAL_CHANGES),
    incomplete: byKey.size > MAX_SIMULATION_APPROVAL_CHANGES,
  };
}

async function enrichProjection(
  client: PublicClient | null,
  chainId: number,
  approvalChanges: ApprovalChange[],
  residualApprovals: ResidualApproval[],
  approvalDetectionIncomplete: boolean,
): Promise<ApprovalProjection> {
  const entries = [...approvalChanges, ...residualApprovals];
  if (!client || entries.length === 0) {
    return {
      approvalChanges,
      residualApprovals,
      approvalDetectionIncomplete,
      metadataComplete: entries.length === 0,
    };
  }
  const enriched = await enrichApprovalMetadata(
    client,
    chainId,
    entries,
  ).catch(() => ({ changes: entries, metadataComplete: false }));
  return {
    approvalChanges: enriched.changes.slice(
      0,
      approvalChanges.length,
    ) as ApprovalChange[],
    residualApprovals: enriched.changes.slice(
      approvalChanges.length,
    ) as ResidualApproval[],
    approvalDetectionIncomplete,
    metadataComplete: enriched.metadataComplete,
  };
}

/**
 * Discover approval pairs from runtime logs plus bounded local calldata, then
 * replay the request with allowance readbacks to retain only persistent
 * increases. No retry-only balance/allowance overrides enter this flow.
 */
export async function simulateApprovalChanges(
  calls: ApprovalSimulationCall[],
  ownerAddress: string,
  chainId: number,
  initialRun?: EthSimulateV1Run | null,
  options: ApprovalSimulationOptions = {},
): Promise<ApprovalProjection> {
  const includeApprovalChanges = options.includeApprovalChanges !== false;
  const includeResidualApprovals = options.includeResidualApprovals !== false;
  const staticDiscovery = includeApprovalChanges
    ? discoverApprovalIntents(calls, ownerAddress)
    : { intents: [], incomplete: false };
  const client = await getSimulationClient(chainId);
  const firstRun =
    initialRun === undefined
      ? await runEthSimulateV1Calls(calls, ownerAddress, chainId)
      : initialRun;

  if (!client || !firstRun) {
    return enrichProjection(
      client,
      chainId,
      buildFallbackApprovalChanges(staticDiscovery.intents),
      [],
      true,
    );
  }

  const eventDiscovery = includeApprovalChanges
    ? discoverApprovalIntentsFromLogs(firstRun.callResults, ownerAddress)
    : { intents: [], incomplete: false };
  const merged = mergeIntents(
    staticDiscovery.intents,
    eventDiscovery.intents,
  );
  const residualDiscovery = includeResidualApprovals
    ? discoverResidualApprovalCandidates(
        calls,
        firstRun.callResults,
        ownerAddress,
        options.tracedResidualCandidates,
      )
    : { candidates: [], incomplete: false };
  const pairMerge = mergeAllowancePairs(
    merged.intents,
    residualDiscovery.candidates,
  );
  const pairs = pairMerge.pairs;
  if (pairs.length === 0) {
    return {
      approvalChanges: [],
      residualApprovals: [],
      approvalDetectionIncomplete:
        eventDiscovery.incomplete ||
        residualDiscovery.incomplete ||
        merged.incomplete ||
        options.traceIncomplete === true,
      metadataComplete: true,
    };
  }

  const preStatesPromise = readAllowancePreStates(
    client,
    pairs,
    firstRun.blockNumber,
  );
  const readCalls = pairs.map((pair) => {
    const read = encodeAllowanceRead(pair);
    return { to: read.to, data: read.data, value: "0x0" };
  });
  const [preStates, secondRun, block] = await Promise.all([
    preStatesPromise,
    runEthSimulateV1Calls(
      [...calls, ...readCalls],
      ownerAddress,
      chainId,
      firstRun.blockNumber,
    ),
    client.getBlock({ blockNumber: firstRun.blockNumber }).catch(() => null),
  ]);

  if (
    !secondRun ||
    secondRun.callResults.length < calls.length + readCalls.length
  ) {
    return enrichProjection(
      client,
      chainId,
      buildFallbackApprovalChanges(merged.intents),
      [],
      true,
    );
  }

  const projected: ApprovalChange[] = [];
  const finalStates = new Map<string, AllowanceState | null>();
  let verificationIncomplete =
    eventDiscovery.incomplete ||
    residualDiscovery.incomplete ||
    merged.incomplete ||
    pairMerge.incomplete ||
    firstRun.callResults.length !== calls.length;
  verificationIncomplete ||= options.traceIncomplete === true;
  pairs.forEach((pair, index) => {
    const readResult = secondRun.callResults[calls.length + index];
    const remaining =
      readResult?.status === "0x1"
        ? decodeAllowanceRead(pair, readResult.returnData)
        : null;
    finalStates.set(allowancePairKey(pair), remaining);
  });
  merged.intents.forEach((intent) => {
    const key = allowancePairKey(intent);
    const projection = projectApprovalChange(
      intent,
      preStates.get(key) ?? null,
      finalStates.get(key) ?? null,
      block?.timestamp ?? null,
    );
    verificationIncomplete ||= projection.incomplete;
    if (projection.change) projected.push(projection.change);
  });
  const residualApprovals = projectResidualApprovals(
    residualDiscovery.candidates,
    preStates,
    finalStates,
  );

  return enrichProjection(
    client,
    chainId,
    projected,
    residualApprovals,
    verificationIncomplete,
  );
}

export function withoutApprovalChanges(
  incomplete = false,
): Pick<
  ApprovalProjection,
  | "approvalChanges"
  | "residualApprovals"
  | "approvalDetectionIncomplete"
> {
  return {
    approvalChanges: [],
    residualApprovals: [],
    approvalDetectionIncomplete: incomplete,
  };
}
