import {
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { ERC20_ALLOWANCE_ABI, PERMIT2_ALLOWANCE_ABI } from "./approvalAbis";
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
import { MAX_SIMULATION_APPROVAL_CHANGES, PERMIT2_ADDRESS } from "./constants";
import {
  runEthSimulateV1Calls,
  type EthSimulateV1Run,
} from "./ethSimulateClient";
import type { ApprovalChange } from "./types";

export interface ApprovalProjection {
  approvalChanges: ApprovalChange[];
  approvalDetectionIncomplete: boolean;
  metadataComplete: boolean;
}

function intentKey(intent: ApprovalIntent): string {
  return [
    intent.system,
    intent.tokenAddress.toLowerCase(),
    intent.owner.toLowerCase(),
    intent.spender.toLowerCase(),
  ].join(":");
}

function mergeIntents(
  staticIntents: ApprovalIntent[],
  eventIntents: ApprovalIntent[],
): { intents: ApprovalIntent[]; incomplete: boolean } {
  const byKey = new Map<string, ApprovalIntent>();
  for (const intent of [...staticIntents, ...eventIntents]) {
    const key = intentKey(intent);
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

function encodeAllowanceRead(intent: ApprovalIntent): {
  to: Address;
  data: Hex;
} {
  if (intent.system === "permit2") {
    return {
      to: PERMIT2_ADDRESS,
      data: encodeFunctionData({
        abi: PERMIT2_ALLOWANCE_ABI,
        functionName: "allowance",
        args: [intent.owner, intent.tokenAddress, intent.spender],
      }),
    };
  }
  return {
    to: intent.tokenAddress,
    data: encodeFunctionData({
      abi: ERC20_ALLOWANCE_ABI,
      functionName: "allowance",
      args: [intent.owner, intent.spender],
    }),
  };
}

function decodeAllowanceRead(
  intent: ApprovalIntent,
  data: string | undefined,
): AllowanceState | null {
  if (!data || data === "0x" || !/^0x[0-9a-fA-F]+$/.test(data)) return null;
  try {
    if (intent.system === "permit2") {
      const [amount, expiration] = decodeFunctionResult({
        abi: PERMIT2_ALLOWANCE_ABI,
        functionName: "allowance",
        data: data as Hex,
      });
      return { amount, expiration: Number(expiration) };
    }
    const amount = decodeFunctionResult({
      abi: ERC20_ALLOWANCE_ABI,
      functionName: "allowance",
      data: data as Hex,
    });
    return { amount, expiration: null };
  } catch {
    return null;
  }
}

async function readPreState(
  client: PublicClient,
  intent: ApprovalIntent,
  blockNumber: bigint,
): Promise<AllowanceState | null> {
  const read = encodeAllowanceRead(intent);
  try {
    const result = await client.call({
      to: read.to,
      data: read.data,
      blockNumber,
    });
    return decodeAllowanceRead(intent, result.data);
  } catch {
    return null;
  }
}

async function enrichProjection(
  client: PublicClient | null,
  chainId: number,
  approvalChanges: ApprovalChange[],
  approvalDetectionIncomplete: boolean,
): Promise<ApprovalProjection> {
  if (!client || approvalChanges.length === 0) {
    return {
      approvalChanges,
      approvalDetectionIncomplete,
      metadataComplete: approvalChanges.length === 0,
    };
  }
  const enriched = await enrichApprovalMetadata(
    client,
    chainId,
    approvalChanges,
  ).catch(() => ({ changes: approvalChanges, metadataComplete: false }));
  return {
    approvalChanges: enriched.changes,
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
): Promise<ApprovalProjection> {
  const staticDiscovery = discoverApprovalIntents(calls, ownerAddress);
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
      true,
    );
  }

  const eventDiscovery = discoverApprovalIntentsFromLogs(
    firstRun.callResults,
    ownerAddress,
  );
  const merged = mergeIntents(
    staticDiscovery.intents,
    eventDiscovery.intents,
  );
  if (merged.intents.length === 0) {
    return {
      approvalChanges: [],
      approvalDetectionIncomplete:
        eventDiscovery.incomplete || merged.incomplete,
      metadataComplete: true,
    };
  }

  const preStatesPromise = Promise.all(
    merged.intents.map((intent) =>
      readPreState(client, intent, firstRun.blockNumber),
    ),
  );
  const readCalls = merged.intents.map((intent) => {
    const read = encodeAllowanceRead(intent);
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

  if (!secondRun || secondRun.callResults.length < calls.length) {
    return enrichProjection(
      client,
      chainId,
      buildFallbackApprovalChanges(merged.intents),
      true,
    );
  }

  const projected: ApprovalChange[] = [];
  let verificationIncomplete =
    eventDiscovery.incomplete ||
    merged.incomplete ||
    firstRun.callResults.length !== calls.length;
  merged.intents.forEach((intent, index) => {
    const readResult = secondRun.callResults[calls.length + index];
    const remaining =
      readResult?.status === "0x1"
        ? decodeAllowanceRead(intent, readResult.returnData)
        : null;
    const projection = projectApprovalChange(
      intent,
      preStates[index],
      remaining,
      block?.timestamp ?? null,
    );
    verificationIncomplete ||= projection.incomplete;
    if (projection.change) projected.push(projection.change);
  });

  return enrichProjection(
    client,
    chainId,
    projected,
    verificationIncomplete,
  );
}

export function withoutApprovalChanges(
  incomplete = false,
): Pick<
  ApprovalProjection,
  "approvalChanges" | "approvalDetectionIncomplete"
> {
  return {
    approvalChanges: [],
    approvalDetectionIncomplete: incomplete,
  };
}
