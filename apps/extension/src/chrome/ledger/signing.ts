import {
  concatHex,
  createWalletClient,
  getAddress,
  http,
  recoverMessageAddress,
  recoverTypedDataAddress,
  recoverTransactionAddress,
  serializeTransaction,
  toHex,
  type Chain,
  type TransactionSerializable,
} from "viem";
import { VIEM_CHAINS, RPC_URLS, buildCustomViemChain } from "@/constants/chainRegistry";
import { getStoredResolvedChainById } from "@/lib/chains";
import type { TransactionParams } from "../bankr/submission";
import type { LedgerAccount } from "../types";
import {
  signLedgerMessage,
  signLedgerTransaction,
  signLedgerTypedData,
} from "./offscreenBridge";
import type { SignatureMethod } from "../requests/pendingSignatureStorage";
import { broadcastSerializedTransaction } from "../localSigner";
import type { SignedTransaction } from "../localSigner";

interface GasOverrides {
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

export async function signAndBroadcastLedgerTransaction(input: {
  opId: string;
  account: LedgerAccount;
  tx: TransactionParams & { nonce: number };
  gasOverrides?: GasOverrides;
  beforeBroadcast?: () => Promise<void>;
}): Promise<SignedTransaction> {
  const { chain, rpcUrl } = await resolveChain(input.tx.chainId);
  const client = createWalletClient({ chain, transport: http(rpcUrl, { timeout: 30_000 }) });
  const tx = input.gasOverrides
    ? {
        ...input.tx,
        gas: input.gasOverrides.gasLimit,
        maxFeePerGas: input.gasOverrides.maxFeePerGas,
        maxPriorityFeePerGas: input.gasOverrides.maxPriorityFeePerGas,
        gasPrice: undefined,
      }
    : input.tx;
  const prepared = await client.prepareTransactionRequest({
    account: getAddress(input.account.address),
    chain,
    to: tx.to ? getAddress(tx.to) : undefined,
    data: (tx.data || "0x") as `0x${string}`,
    value: BigInt(tx.value || "0"),
    nonce: tx.nonce,
    ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
    ...(tx.gasPrice ? { gasPrice: BigInt(tx.gasPrice) } : {}),
    ...(tx.maxFeePerGas ? { maxFeePerGas: BigInt(tx.maxFeePerGas) } : {}),
    ...(tx.maxPriorityFeePerGas ? { maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) } : {}),
  } as never);
  const serializable = stripPreparedContext(prepared as Record<string, unknown>);
  const unsignedTx = serializeTransaction(serializable);
  const signature = await signLedgerTransaction({
    opId: input.opId,
    deviceId: input.account.deviceId,
    hdPath: input.account.hdPath,
    unsignedTx,
  });
  const signedRaw = serializeTransaction(serializable, {
    r: signature.r,
    s: signature.s,
    yParity: normalizeYParity(signature.v, input.tx.chainId),
  });
  const recovered = await recoverTransactionAddress({ serializedTransaction: signedRaw });
  if (recovered.toLowerCase() !== input.account.address.toLowerCase()) {
    throw new Error("Ledger signed with a different account. Check the connected device and derivation path.");
  }
  await input.beforeBroadcast?.();
  const result = await broadcastSerializedTransaction(client as never, signedRaw, {
    chainId: input.tx.chainId,
    supportsSyncSend: false,
  });
  return { ...result, signedGasLimit: serializable.gas };
}

export async function signLedgerSignatureRequest(input: {
  opId: string;
  account: LedgerAccount;
  method: SignatureMethod;
  params: unknown[];
  chainId: number;
}): Promise<`0x${string}`> {
  if (input.method === "eth_sign") throw new Error("eth_sign is not supported.");
  let signature: { r: `0x${string}`; s: `0x${string}`; v: number };
  let messageHex: `0x${string}` | null = null;
  let typedDataForRecovery: Record<string, unknown> | null = null;
  if (input.method === "personal_sign") {
    const raw = input.params[0];
    const hex = typeof raw === "string" && raw.startsWith("0x")
      ? raw as `0x${string}`
      : toHex(String(raw ?? ""));
    messageHex = hex;
    signature = await signLedgerMessage({
      opId: input.opId, deviceId: input.account.deviceId,
      hdPath: input.account.hdPath, hex,
    });
  } else {
    const raw = input.params[1];
    const typedData = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!typedData || typeof typedData !== "object") throw new Error("Invalid typed data.");
    const domainChainId = Number((typedData as { domain?: { chainId?: unknown } }).domain?.chainId);
    if (Number.isFinite(domainChainId) && domainChainId !== input.chainId) {
      throw new Error(`Provided chainId "${domainChainId}" must match the active chainId "${input.chainId}"`);
    }
    signature = await signLedgerTypedData({
      opId: input.opId, deviceId: input.account.deviceId,
      hdPath: input.account.hdPath, typedData: typedData as Record<string, unknown>,
    });
    typedDataForRecovery = typedData as Record<string, unknown>;
  }
  const recovery = signature.v === 0 || signature.v === 1 ? signature.v + 27 : signature.v;
  const signatureHex = concatHex([signature.r, signature.s, toHex(recovery, { size: 1 })]);
  const recovered = messageHex
    ? await recoverMessageAddress({ message: { raw: messageHex }, signature: signatureHex })
    : await recoverTypedDataAddress({
        ...(typedDataForRecovery as Record<string, unknown>),
        signature: signatureHex,
      } as never);
  if (recovered.toLowerCase() !== input.account.address.toLowerCase()) {
    throw new Error("Ledger signed with a different account. Check the connected device and derivation path.");
  }
  return signatureHex;
}

async function resolveChain(chainId: number): Promise<{ chain: Chain; rpcUrl: string }> {
  const resolved = await getStoredResolvedChainById(chainId);
  const rpcUrl = resolved?.rpcUrl || RPC_URLS[chainId];
  if (!rpcUrl) throw new Error(`No RPC URL configured for chain ${chainId}.`);
  const chain = VIEM_CHAINS[chainId] || buildCustomViemChain(
    chainId,
    resolved?.name || `Chain ${chainId}`,
    rpcUrl,
    resolved?.nativeCurrency,
    resolved?.explorer || undefined,
  );
  return { chain, rpcUrl };
}

function stripPreparedContext(prepared: Record<string, unknown>): TransactionSerializable {
  const transaction = { ...prepared };
  delete transaction.account;
  delete transaction.chain;
  delete transaction.from;
  return transaction as TransactionSerializable;
}

function normalizeYParity(v: number, chainId: number): 0 | 1 {
  if (v === 0 || v === 1) return v;
  if (v === 27 || v === 28) return (v - 27) as 0 | 1;
  const parity = (BigInt(v) - 35n - 2n * BigInt(chainId)) & 1n;
  return Number(parity) as 0 | 1;
}
