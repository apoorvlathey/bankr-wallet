import {
  getAddress,
  recoverTypedDataAddress,
  type Hex,
} from "viem";
import { buildSafeTransactionTypedData } from "./transactionHash";
import type {
  SafeAddress,
  SafeOwnerConfirmation,
  SafeProposalRecord,
} from "./types";

function normalizeSignature(signature: string): Hex {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("Invalid Safe owner signature");
  }
  const bytes = signature.slice(2);
  let v = Number.parseInt(bytes.slice(128, 130), 16);
  if (v === 0 || v === 1) v += 27;
  if (v !== 27 && v !== 28) throw new Error("Unsupported Safe signature type");
  return `0x${bytes.slice(0, 128)}${v.toString(16).padStart(2, "0")}` as Hex;
}

export async function recoverSafeConfirmationOwner(
  proposal: Pick<SafeProposalRecord, "chainId" | "safeAddress" | "safeVersion" | "transaction">,
  signature: string,
): Promise<SafeAddress> {
  const normalized = normalizeSignature(signature);
  const typedData = buildSafeTransactionTypedData({
    chainId: proposal.chainId,
    safeAddress: proposal.safeAddress,
    safeVersion: proposal.safeVersion,
    transaction: proposal.transaction,
  });
  const types = { SafeTx: typedData.types.SafeTx };
  const recovered = await recoverTypedDataAddress({
    domain: {
      ...typedData.domain,
      chainId:
        typedData.domain.chainId === undefined
          ? undefined
          : BigInt(typedData.domain.chainId),
    },
    types,
    primaryType: typedData.primaryType,
    message: typedData.message,
    signature: normalized,
  });
  return getAddress(recovered).toLowerCase() as SafeAddress;
}

export async function validateSafeOwnerConfirmation(input: {
  proposal: SafeProposalRecord;
  signature: string;
  expectedOwner: SafeAddress;
  currentOwners: readonly SafeAddress[];
  accountId: string;
  accountType: SafeOwnerConfirmation["accountType"];
}): Promise<SafeOwnerConfirmation> {
  const expected = getAddress(input.expectedOwner).toLowerCase() as SafeAddress;
  const current = new Set(input.currentOwners.map((owner) => owner.toLowerCase()));
  if (!current.has(expected)) throw new Error("Selected signer is no longer a Safe owner");
  const recovered = await recoverSafeConfirmationOwner(input.proposal, input.signature);
  if (recovered !== expected) throw new Error("Safe signature does not match selected owner");
  return {
    ownerAddress: expected,
    accountId: input.accountId,
    accountType: input.accountType,
    signature: normalizeSignature(input.signature),
    createdAt: Date.now(),
  };
}

export function packSafeSignatures(
  confirmations: readonly SafeOwnerConfirmation[],
): Hex {
  const unique = new Map<string, SafeOwnerConfirmation>();
  for (const confirmation of confirmations) {
    const owner = confirmation.ownerAddress.toLowerCase();
    if (unique.has(owner)) throw new Error("Duplicate Safe owner confirmation");
    unique.set(owner, confirmation);
  }
  return `0x${[...unique.values()]
    .sort((a, b) => a.ownerAddress.localeCompare(b.ownerAddress))
    .map((confirmation) => normalizeSignature(confirmation.signature).slice(2))
    .join("")}` as Hex;
}
