import { signMessageViaApi } from "../bankr/signing";
import type { Account } from "../types";
import type { Hex, PackedUserOperationV07 } from "./pimlicoTypes";
import {
  getMetaMaskUserOperationTypedData,
  signMetaMaskUserOperation,
} from "./userOperation";

function jsonSafeTypedData(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafeTypedData);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, jsonSafeTypedData(child)]),
    );
  }
  return value;
}

export type FeePaymentSigner =
  | {
      account: Extract<
        Account,
        { type: "privateKey" | "seedPhrase" | "ledger" }
      >;
      privateKey: Hex;
      apiKey?: never;
    }
  | {
      account: Extract<Account, { type: "bankr" }>;
      apiKey: string;
      privateKey?: never;
    };

export async function signPreparedUserOperation(
  signer: FeePaymentSigner,
  userOperation: PackedUserOperationV07,
  chainId: number,
): Promise<Hex> {
  if (
    signer.account.address.toLowerCase() !==
    userOperation.sender.toLowerCase()
  ) {
    throw new Error("UserOperation account no longer matches the reviewed account");
  }
  if (signer.privateKey) {
    return signMetaMaskUserOperation(
      signer.privateKey,
      userOperation,
      chainId,
    );
  }
  const result = await signMessageViaApi(
    signer.apiKey,
    "eth_signTypedData_v4",
    [
      signer.account.address,
      jsonSafeTypedData(
        getMetaMaskUserOperationTypedData(userOperation, chainId),
      ),
    ],
  );
  return result.signature as Hex;
}
