export type ForceInclusionStage =
  | "building"
  | "submitting"
  | "waiting-l1"
  | "complete"
  | "error";

export interface ForceInclusionProgressData {
  stage: ForceInclusionStage;
  l1Hash?: string;
  l2Hash?: string;
  error?: string;
  l1ChainId: number;
  l2ChainId: number;
  timestamp: number;
}

export type ForceInclusionProgressWriter = (
  stage: ForceInclusionStage,
  extra?: Partial<ForceInclusionProgressData>,
) => Promise<void>;

export interface ForceInclusionAccount {
  id: string;
  address: string;
  type: string;
}

export interface ForceInclusionGasOverrides {
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}
