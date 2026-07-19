export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export interface Eip7702Authorization {
  address: Address;
  chainId: Hex;
  nonce: Hex;
  r: Hex;
  s: Hex;
  v?: Hex;
  yParity: Hex;
}

export interface PackedUserOperationV07 {
  sender: Address;
  nonce: Hex;
  factory?: Address;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  paymaster?: Address;
  paymasterVerificationGasLimit?: Hex;
  paymasterPostOpGasLimit?: Hex;
  paymasterData?: Hex;
  signature: Hex;
  eip7702Auth?: Eip7702Authorization;
}

export interface PimlicoTokenQuote {
  paymaster: Address;
  token: Address;
  postOpGas: Hex;
  exchangeRate: Hex;
  exchangeRateNativeToUsd: Hex;
  balanceSlot: Hex;
  allowanceSlot: Hex;
}

export interface PimlicoPaymasterData {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit?: Hex;
  paymasterPostOpGasLimit?: Hex;
}

export interface PimlicoGasPrice {
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
}

export interface PimlicoGasPriceTiers {
  slow: PimlicoGasPrice;
  standard: PimlicoGasPrice;
  fast: PimlicoGasPrice;
}

export interface UserOperationGasEstimate {
  preVerificationGas: Hex;
  verificationGasLimit: Hex;
  callGasLimit: Hex;
  paymasterVerificationGasLimit?: Hex;
  paymasterPostOpGasLimit?: Hex;
}

export interface UserOperationReceipt {
  userOpHash: Hex;
  sender: Address;
  nonce: Hex;
  success: boolean;
  actualGasCost: Hex;
  actualGasUsed: Hex;
  receipt: Record<string, unknown>;
}
