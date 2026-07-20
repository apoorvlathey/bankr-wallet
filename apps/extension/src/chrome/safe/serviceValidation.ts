import { decodeFunctionData, getAddress } from "viem";
import { computeSafeTransactionHash } from "./transactionHash";
import { getCanonicalMultiSendAddress } from "./deploymentRegistry";
import { decodeMultiSendTransactions } from "./multiSend";
import { recoverSafeConfirmationOwner } from "./signatureValidation";
import type { SafeAddress, SafeChainSnapshot, SafeOwnerConfirmation, SafeProposalRecord, SafeSupportedVersion, SafeTransactionData, SafeUnsupportedConfirmation } from "./types";

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Safe service transaction");
  return value as Record<string, any>;
}
function decimal(value: unknown, label: string): `${bigint}` {
  const string = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof string !== "string" || !/^(0|[1-9][0-9]*)$/.test(string)) throw new Error(`Invalid Safe service ${label}`);
  return string as `${bigint}`;
}
function address(value: unknown, label: string): SafeAddress {
  if (typeof value !== "string") throw new Error(`Invalid Safe service ${label}`);
  try { return getAddress(value).toLowerCase() as SafeAddress; } catch { throw new Error(`Invalid Safe service ${label}`); }
}
function transaction(raw: Record<string, any>): SafeTransactionData {
  const operation = Number(raw.operation);
  const nonce = Number(raw.nonce);
  if ((operation !== 0 && operation !== 1) || !Number.isSafeInteger(nonce) || nonce < 0) throw new Error("Invalid Safe service operation or nonce");
  const data = raw.data ?? "0x";
  if (typeof data !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(data) || data.length > 2 + 256 * 1024) throw new Error("Invalid Safe service calldata");
  return {
    to: address(raw.to, "target"),
    value: decimal(raw.value, "value"),
    data: data.toLowerCase() as `0x${string}`,
    operation,
    safeTxGas: decimal(raw.safeTxGas, "safeTxGas"),
    baseGas: decimal(raw.baseGas ?? raw.dataGas ?? "0", "baseGas"),
    gasPrice: decimal(raw.gasPrice, "gasPrice"),
    gasToken: address(raw.gasToken, "gas token"),
    refundReceiver: address(raw.refundReceiver, "refund receiver"),
    nonce,
  };
}

export async function validateServiceTransaction(input: {
  value: unknown;
  safeAccountId: string;
  snapshot: SafeChainSnapshot;
  safeAddress: SafeAddress;
}): Promise<SafeProposalRecord> {
  const raw = object(input.value);
  const tx = transaction(raw);
  const hash = typeof raw.safeTxHash === "string" ? raw.safeTxHash.toLowerCase() : "";
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new Error("Invalid Safe service transaction hash");
  const safeAddress = address(raw.safe, "Safe address");
  if (safeAddress !== input.safeAddress) throw new Error("Safe service returned another Safe");
  const recomputed = computeSafeTransactionHash({ chainId: input.snapshot.chainId, safeAddress, safeVersion: input.snapshot.version as SafeSupportedVersion, transaction: tx });
  if (hash !== recomputed) throw new Error("Safe service transaction hash mismatch");
  const confirmationsRaw = Array.isArray(raw.confirmations) ? raw.confirmations.slice(0, 100) : [];
  const confirmations: SafeOwnerConfirmation[] = [];
  const unsupportedConfirmations: SafeUnsupportedConfirmation[] = [];
  for (const itemValue of confirmationsRaw) {
    const item = object(itemValue);
    const claimed = address(item.owner, "confirmation owner");
    if (!input.snapshot.owners.includes(claimed)) throw new Error("Safe service confirmation owner is not current");
    const signatureType = typeof item.signatureType === "string" ? item.signatureType.toUpperCase() : "";
    const createdAt = Date.parse(item.submissionDate || "") || Date.now();
    if (
      typeof item.signature !== "string" ||
      !/^0x[0-9a-fA-F]{130}$/.test(item.signature) ||
      (signatureType && signatureType !== "EOA")
    ) {
      unsupportedConfirmations.push({
        ownerAddress: claimed,
        signatureType: signatureType.includes("CONTRACT")
          ? "contract"
          : signatureType.includes("APPROVED_HASH")
            ? "approvedHash"
            : "unknown",
        createdAt,
      });
      continue;
    }
    const recovered = await recoverSafeConfirmationOwner({ chainId: input.snapshot.chainId, safeAddress, safeVersion: input.snapshot.version, transaction: tx }, item.signature);
    if (recovered !== claimed) throw new Error("Safe service confirmation is invalid");
    if (confirmations.some((existing) => existing.ownerAddress === claimed)) throw new Error("Duplicate Safe service confirmation");
    confirmations.push({ ownerAddress: claimed, signature: item.signature.toLowerCase() as `0x${string}`, createdAt, publishedAt: Date.now() });
  }
  const now = Date.now();
  let calls;
  if (tx.operation === 0) {
    calls = [{ to: tx.to, value: tx.value, data: tx.data, operation: 0 as const }];
  } else {
    const canonical = getCanonicalMultiSendAddress(input.snapshot.chainId, input.snapshot.version);
    if (!canonical || tx.to !== canonical.toLowerCase()) throw new Error("Safe delegatecall does not target canonical MultiSend");
    const decoded = decodeFunctionData({
      abi: [{ type: "function", name: "multiSend", stateMutability: "payable", inputs: [{ name: "transactions", type: "bytes" }], outputs: [] }] as const,
      data: tx.data,
    });
    if (decoded.functionName !== "multiSend") throw new Error("Invalid Safe MultiSend calldata");
    calls = decodeMultiSendTransactions(decoded.args[0]);
  }
  const executionHash = typeof raw.transactionHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(raw.transactionHash) ? raw.transactionHash.toLowerCase() as `0x${string}` : undefined;
  const liveNonce = BigInt(input.snapshot.nonce);
  const proposalNonce = BigInt(tx.nonce);
  const state: SafeProposalRecord["state"] = executionHash
    ? "executed"
    : proposalNonce < liveNonce
      ? "replaced"
      : proposalNonce > liveNonce
        ? "blocked"
        : confirmations.length >= input.snapshot.threshold
          ? "readyToExecute"
          : "awaitingApprovals";
  const purpose = tx.operation === 0 &&
    tx.to === safeAddress &&
    tx.value === "0" &&
    tx.data === "0x"
    ? "rejection" as const
    : undefined;
  return {
    version: 1,
    id: `${input.snapshot.chainId}:${safeAddress}:${hash}`,
    chainId: input.snapshot.chainId,
    safeAccountId: input.safeAccountId,
    safeAddress,
    safeTxHash: hash as `0x${string}`,
    safeVersion: input.snapshot.version,
    safeConfigEpoch: input.snapshot.configEpoch,
    verifiedAtBlock: input.snapshot.verifiedAtBlock,
    calls,
    transaction: tx,
    state,
    confirmations,
    unsupportedConfirmations: unsupportedConfirmations.length ? unsupportedConfirmations : undefined,
    route: { kind: "wallet", origin: typeof raw.origin === "string" ? raw.origin.slice(0, 2048) : undefined },
    purpose,
    createdAt: Date.parse(raw.submissionDate || "") || now,
    updatedAt: Date.parse(raw.modified || "") || now,
    transactionHash: executionHash,
    error: proposalNonce > liveNonce
      ? `Future Safe nonce ${tx.nonce}; executable nonce is ${input.snapshot.nonce}`
      : proposalNonce < liveNonce && !executionHash
        ? "Safe nonce already advanced"
        : undefined,
  };
}
