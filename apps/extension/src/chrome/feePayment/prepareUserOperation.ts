import type {
  Address,
  Eip7702Authorization,
  Hex,
  PackedUserOperationV07,
  PimlicoGasPriceTiers,
  PimlicoPaymasterData,
  PimlicoTokenQuote,
  UserOperationGasEstimate,
} from "./pimlicoTypes";
import {
  addBoundedTokenApproval,
  createDummyTokenApprovalCall,
  getMaxTokenCost,
} from "./paymaster";
import {
  encodeMetaMaskDeleGatorCalls,
  METAMASK_EOA_STUB_SIGNATURE,
  type FeePaymentCall,
} from "./userOperation";

export interface PimlicoPreparationClient {
  getTokenQuotes(tokens: Address[]): Promise<PimlicoTokenQuote[]>;
  getUserOperationGasPrice(): Promise<PimlicoGasPriceTiers>;
  getPaymasterStubData(
    userOperation: PackedUserOperationV07,
    token: Address,
    expectedPaymaster: Address,
  ): Promise<PimlicoPaymasterData>;
  estimateUserOperationGas(
    userOperation: PackedUserOperationV07,
  ): Promise<UserOperationGasEstimate>;
  getPaymasterData(
    userOperation: PackedUserOperationV07,
    token: Address,
    expectedPaymaster: Address,
  ): Promise<PimlicoPaymasterData>;
}

export interface PreparedTokenUserOperation {
  userOperation: PackedUserOperationV07;
  calls: FeePaymentCall[];
  quote: PimlicoTokenQuote;
  maximumTokenCost: bigint;
  approvalAmount: bigint | null;
  approvalAdded: boolean;
}

/** Original USDC ceiling retained for compatibility with the v1 test suite. */
export const MAX_USDC_GAS_COST = 100_000_000n;

function applyPaymasterData(
  userOperation: PackedUserOperationV07,
  data: PimlicoPaymasterData,
): PackedUserOperationV07 {
  return {
    ...userOperation,
    paymaster: data.paymaster,
    paymasterData: data.paymasterData,
    paymasterVerificationGasLimit:
      data.paymasterVerificationGasLimit ??
      userOperation.paymasterVerificationGasLimit ??
      "0x0",
    paymasterPostOpGasLimit:
      data.paymasterPostOpGasLimit ??
      userOperation.paymasterPostOpGasLimit ??
      "0x0",
  };
}

function applyGasEstimate(
  userOperation: PackedUserOperationV07,
  estimate: UserOperationGasEstimate,
): PackedUserOperationV07 {
  return {
    ...userOperation,
    callGasLimit: estimate.callGasLimit,
    verificationGasLimit: estimate.verificationGasLimit,
    preVerificationGas: estimate.preVerificationGas,
    paymasterVerificationGasLimit:
      estimate.paymasterVerificationGasLimit ??
      userOperation.paymasterVerificationGasLimit,
    paymasterPostOpGasLimit:
      estimate.paymasterPostOpGasLimit ?? userOperation.paymasterPostOpGasLimit,
  };
}

async function finalizeEnvelope(
  client: PimlicoPreparationClient,
  userOperation: PackedUserOperationV07,
  token: Address,
  paymaster: Address,
): Promise<PackedUserOperationV07> {
  const stubData = await client.getPaymasterStubData(
    userOperation,
    token,
    paymaster,
  );
  const withStub = applyPaymasterData(userOperation, stubData);
  const withEstimate = applyGasEstimate(
    withStub,
    await client.estimateUserOperationGas(withStub),
  );
  const paymasterData = await client.getPaymasterData(
    withEstimate,
    token,
    paymaster,
  );
  // Pimlico signs the completed envelope returned here. Do not estimate or
  // mutate any UserOperation field after applying this final paymaster data.
  return applyPaymasterData(withEstimate, paymasterData);
}

/**
 * Prepare, but do not sign or submit, one ERC-20-funded v0.7 UserOperation.
 * The dummy unlimited approval is confined to the first simulation envelope.
 */
export async function prepareTokenUserOperation(
  client: PimlicoPreparationClient,
  params: {
    sender: Address;
    nonce: Hex;
    calls: readonly FeePaymentCall[];
    token: Address;
    maximumGasCost: bigint;
    currentAllowance?: bigint;
    getCurrentAllowance?: (paymaster: Address) => Promise<bigint>;
    eip7702Auth?: Eip7702Authorization;
  },
): Promise<PreparedTokenUserOperation> {
  if (params.calls.length === 0) throw new Error("At least one call is required");
  const [quotes, gasPrices] = await Promise.all([
    client.getTokenQuotes([params.token]),
    client.getUserOperationGasPrice(),
  ]);
  const quote = quotes[0];
  if (!quote || quotes.length !== 1) {
    throw new Error("Pimlico did not return exactly one fee-token quote");
  }
  const currentAllowance =
    params.currentAllowance ??
    (await params.getCurrentAllowance?.(quote.paymaster));
  if (currentAllowance === undefined || currentAllowance < 0n) {
    throw new Error("Current fee-token allowance is unavailable");
  }

  let userOperation: PackedUserOperationV07 = {
    sender: params.sender,
    nonce: params.nonce,
    callData: encodeMetaMaskDeleGatorCalls(params.sender, [
      createDummyTokenApprovalCall(params.token, quote.paymaster),
      ...params.calls,
    ]),
    callGasLimit: "0x0",
    verificationGasLimit: "0x0",
    preVerificationGas: "0x0",
    maxFeePerGas: gasPrices.standard.maxFeePerGas,
    maxPriorityFeePerGas: gasPrices.standard.maxPriorityFeePerGas,
    signature: METAMASK_EOA_STUB_SIGNATURE,
    ...(params.eip7702Auth ? { eip7702Auth: params.eip7702Auth } : {}),
  };

  const stubData = await client.getPaymasterStubData(
    userOperation,
    params.token,
    quote.paymaster,
  );
  userOperation = applyPaymasterData(userOperation, stubData);
  userOperation = applyGasEstimate(
    userOperation,
    await client.estimateUserOperationGas(userOperation),
  );

  const initial = addBoundedTokenApproval(params.calls, {
    token: params.token,
    quote,
    estimatedUserOperation: userOperation,
    currentAllowance,
  });
  let calls = initial.calls;
  let approvalAmount = initial.approvalAdded ? initial.maximumTokenCost : null;
  userOperation = {
    ...userOperation,
    callData: encodeMetaMaskDeleGatorCalls(params.sender, calls),
  };
  userOperation = await finalizeEnvelope(
    client,
    userOperation,
    params.token,
    quote.paymaster,
  );

  let maximumTokenCost = getMaxTokenCost(userOperation, quote);
  const availableAllowance = approvalAmount ?? currentAllowance;
  if (availableAllowance < maximumTokenCost) {
    calls = addBoundedTokenApproval(params.calls, {
      token: params.token,
      quote,
      estimatedUserOperation: userOperation,
      currentAllowance,
    }).calls;
    approvalAmount = maximumTokenCost;
    userOperation = {
      ...userOperation,
      callData: encodeMetaMaskDeleGatorCalls(params.sender, calls),
    };
    userOperation = await finalizeEnvelope(
      client,
      userOperation,
      params.token,
      quote.paymaster,
    );
    maximumTokenCost = getMaxTokenCost(userOperation, quote);
    if (approvalAmount < maximumTokenCost) {
      throw new Error("Pimlico maximum token cost did not stabilize");
    }
  }
  if (
    params.maximumGasCost <= 0n ||
    maximumTokenCost <= 0n ||
    maximumTokenCost > params.maximumGasCost
  ) {
    throw new Error("Fee-token gas quote exceeds WalletChan's safety limit");
  }

  return {
    userOperation,
    calls,
    quote,
    maximumTokenCost,
    approvalAmount,
    approvalAdded: approvalAmount !== null,
  };
}

export type PreparedUsdcUserOperation = PreparedTokenUserOperation;
export async function prepareUsdcUserOperation(
  client: PimlicoPreparationClient,
  params: Omit<Parameters<typeof prepareTokenUserOperation>[1], "token" | "maximumGasCost"> & {
    usdc: Address;
  },
): Promise<PreparedTokenUserOperation> {
  return prepareTokenUserOperation(client, {
    ...params,
    token: params.usdc,
    maximumGasCost: MAX_USDC_GAS_COST,
  });
}
