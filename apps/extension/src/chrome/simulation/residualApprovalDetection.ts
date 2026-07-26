import { enrichApprovalMetadata } from "./approvalMetadata";
import type { ApprovalSimulationCall } from "./approvalIntents";
import { getSimulationClient } from "./client";
import { runEthSimulateV1Calls } from "./ethSimulateClient";
import { discoverResidualApprovalCandidates } from "./residualApprovalCandidates";
import { simulateResidualAllowanceStates } from "./residualAllowanceSimulation";
import { projectResidualApprovals } from "./residualApprovalProjection";
import { traceResidualApprovalCandidates } from "./residualApprovalTrace";
import type { ApprovalProjection } from "./approvalSimulation";

function incompleteProjection(): ApprovalProjection {
  return {
    approvalChanges: [],
    residualApprovals: [],
    approvalDetectionIncomplete: true,
    metadataComplete: true,
  };
}

/**
 * Late, best-effort residual detection. The UI never waits on this function
 * for its primary asset-change result.
 */
export async function simulateResidualApprovals(
  calls: ApprovalSimulationCall[],
  ownerAddress: string,
  chainId: number,
): Promise<ApprovalProjection> {
  const client = await getSimulationClient(chainId);
  if (!client) return incompleteProjection();

  let blockNumber: bigint;
  try {
    blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  } catch {
    return incompleteProjection();
  }

  const [firstRun, trace] = await Promise.all([
    runEthSimulateV1Calls(calls, ownerAddress, chainId, blockNumber),
    traceResidualApprovalCandidates({
      calls,
      ownerAddress,
      chainId,
      blockNumber,
    }),
  ]);
  const discovery = discoverResidualApprovalCandidates(
    calls,
    firstRun?.callResults ?? [],
    ownerAddress,
    trace?.candidates ?? [],
  );
  if (discovery.candidates.length === 0) {
    return {
      approvalChanges: [],
      residualApprovals: [],
      approvalDetectionIncomplete:
        !firstRun || !trace || trace.incomplete || discovery.incomplete,
      metadataComplete: true,
    };
  }

  const states = await simulateResidualAllowanceStates({
    client,
    calls,
    candidates: discovery.candidates,
    ownerAddress,
    blockNumber,
  });
  if (!states.allSuccess) return incompleteProjection();

  const residualApprovals = projectResidualApprovals(
    discovery.candidates,
    states.before,
    states.after,
  );
  const enriched = await enrichApprovalMetadata(
    client,
    chainId,
    residualApprovals,
  ).catch(() => ({
    changes: residualApprovals,
    metadataComplete: residualApprovals.length === 0,
  }));
  return {
    approvalChanges: [],
    residualApprovals: enriched.changes,
    approvalDetectionIncomplete:
      !firstRun ||
      !trace ||
      trace.incomplete ||
      discovery.incomplete ||
      states.incomplete,
    metadataComplete: enriched.metadataComplete,
  };
}
