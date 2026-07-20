import {
  createPublicClient,
  encodeFunctionData,
  parseAbi,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

import { estimateFees } from "../../gas/feeEstimator";
import { DEFAULT_GAS_BUFFER_PCT } from "../../gas/singlePolicy";
import { secureHttpTransport } from "../../network/rpcClient";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
import { PRIVACY_POOLS_RPC_BATCH_SIZE } from "../rpcPolicy";

const ENTRYPOINT_DEPOSIT_ABI = parseAbi([
  "function deposit(uint256 precommitment) payable returns (uint256)",
]);
const SNARK_SCALAR_FIELD =
  21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617n;

export interface PrivacyShieldRpcQuote {
  readonly balanceWei: bigint;
  readonly gasLimit: bigint;
  readonly maxFeePerGas: bigint;
}

function createPublicQuotePrecommitment(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return (value % (SNARK_SCALAR_FIELD - 1n)) + 1n;
}

/** Simulate the exact native-deposit call without deriving or persisting a note. */
export async function readPrivacyShieldRpcQuote(
  rpcUrl: string,
  sourceAddress: Address,
  amountWei: bigint,
): Promise<PrivacyShieldRpcQuote> {
  const client = createPublicClient({
    chain: sepolia,
    transport: secureHttpTransport(rpcUrl, {
      batch: { batchSize: PRIVACY_POOLS_RPC_BATCH_SIZE, wait: 0 },
      retryCount: 1,
      timeout: 12_000,
    }),
  });
  const data = encodeFunctionData({
    abi: ENTRYPOINT_DEPOSIT_ABI,
    functionName: "deposit",
    args: [createPublicQuotePrecommitment()],
  });

  const [balanceWei, estimatedGas, fees] = await Promise.all([
    client.getBalance({ address: sourceAddress }),
    client.estimateGas({
      account: sourceAddress,
      to: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.entrypointProxy.address,
      data,
      value: amountWei,
    }),
    estimateFees(client, PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.chainId),
  ]);
  if (!fees || fees.maxFeePerGas <= 0n || estimatedGas <= 0n) {
    throw new Error("Privacy Shield fee estimate unavailable");
  }
  const gasLimit =
    (estimatedGas * BigInt(100 + DEFAULT_GAS_BUFFER_PCT)) / 100n;
  return Object.freeze({
    balanceWei,
    gasLimit,
    maxFeePerGas: fees.maxFeePerGas,
  });
}
