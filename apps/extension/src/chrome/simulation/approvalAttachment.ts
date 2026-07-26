import {
  simulateApprovalChanges,
  withoutApprovalChanges,
  type ApprovalProjection,
} from "./approvalSimulation";
import type { ApprovalSimulationCall } from "./approvalIntents";
import type { SimulationResult } from "./types";

export function createApprovalProjectionPromise(
  calls: ApprovalSimulationCall[],
  ownerAddress: string,
  chainId: number,
  includeApprovals = true,
): Promise<ApprovalProjection> {
  return includeApprovals
    ? simulateApprovalChanges(calls, ownerAddress, chainId, undefined, {
        includeResidualApprovals: false,
      })
    : Promise.resolve({
        ...withoutApprovalChanges(false),
        metadataComplete: true,
      });
}

export async function attachApprovalProjection(
  result: SimulationResult,
  approvalPromise: Promise<ApprovalProjection>,
): Promise<SimulationResult> {
  const approval = await approvalPromise;
  if (!result.txSuccess && !result.simulationFailed) {
    return {
      ...result,
      ...withoutApprovalChanges(approval.approvalDetectionIncomplete),
    };
  }
  return {
    ...result,
    approvalChanges: approval.approvalChanges,
    residualApprovals: approval.residualApprovals,
    approvalDetectionIncomplete: approval.approvalDetectionIncomplete,
    metadataComplete: result.metadataComplete && approval.metadataComplete,
  };
}
