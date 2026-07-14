export interface SimulationFailureSignals {
  simulationReverted: boolean;
  gasEstimateFailed?: boolean;
}

/**
 * A missing simulation is informational; an explicit revert or failed gas
 * estimate means the request is likely to fail and needs a second confirmation.
 */
export function shouldConfirmSimulationFailure({
  simulationReverted,
  gasEstimateFailed = false,
}: SimulationFailureSignals): boolean {
  return simulationReverted || gasEstimateFailed;
}
