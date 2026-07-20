import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import {
  BankrApiError,
  extractBankrErrorMessage,
  isEvmAddress,
  normalizeSubmitTransactionResponse,
  type SubmitTransactionDirectResponse,
} from "./response";
import { verifyBankrCredentialAddress } from "./signing";
import { bankrFetchText } from "./transport";

export interface TransactionParams {
  from: string;
  to: string | null;
  data?: string;
  value?: string;
  chainId: number;
  /** Background-authored exact nonce for a reviewed replacement request. */
  nonce?: number;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

/** Submit one reviewed transaction through Bankr's irreversible endpoint. */
export async function submitTransactionDirect(
  apiKey: string,
  tx: TransactionParams,
  signal?: AbortSignal,
  beforeIrreversibleRequest?: () => void | Promise<void>,
): Promise<SubmitTransactionDirectResponse> {
  if (!isEvmAddress(tx.from)) {
    throw new BankrApiError("Transaction is missing a valid reviewed signer");
  }

  // `/wallet/submit` does not accept `from`. Prove the global API credential
  // controls the reviewed account before invoking the irreversible endpoint.
  await verifyBankrCredentialAddress(apiKey, tx.from, signal);

  // Bankr rejects non-whitelisted transaction keys and handles gas server-side.
  const body: Record<string, any> = {
    transaction: {
      to: tx.to || undefined,
      chainId: tx.chainId,
      value: hexToDecimalString(tx.value),
      data: tx.data && tx.data !== "0x" ? tx.data : undefined,
    },
    waitForConfirmation: true,
  };
  body.transaction = Object.fromEntries(
    Object.entries(body.transaction).filter(([, value]) => value !== undefined),
  );

  let response: Response;
  let text: string;
  let request: Promise<{ response: Response; text: string }> | null = null;
  let irreversibleStarted = false;
  try {
    await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
      await beforeIrreversibleRequest?.();
      irreversibleStarted = true;
      request = bankrFetchText(
        "/wallet/submit",
        {
          method: "POST",
          headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal,
        },
        { action: "transaction submission" },
      );
    });
    if (!request) throw new Error("Bankr submission did not start");
    ({ response, text } = await request);
  } catch (error) {
    if (!irreversibleStarted) throw error;
    throw new BankrApiError(
      "Transaction submission outcome is unknown; check activity before retrying.",
      undefined,
      true,
    );
  }

  if (!response.ok) {
    if (
      response.status === 408 ||
      response.status === 409 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      throw new BankrApiError(
        "Transaction submission outcome is unknown; check activity before retrying.",
        response.status,
        true,
      );
    }
    throw new BankrApiError(
      `Failed to submit transaction: ${extractBankrErrorMessage(text)}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BankrApiError(
      "Bankr response could not prove the transaction outcome; check activity before retrying.",
      undefined,
      true,
    );
  }
  try {
    return normalizeSubmitTransactionResponse(payload, tx.from, tx.chainId);
  } catch (error) {
    if (error instanceof BankrApiError) {
      throw new BankrApiError(
        `${error.message}. Check activity before retrying.`,
        error.statusCode,
        true,
      );
    }
    throw error;
  }
}

function hexToDecimalString(hex: string | undefined): string {
  if (!hex || hex === "0x0" || hex === "0x") {
    return "0";
  }
  try {
    return BigInt(hex).toString();
  } catch {
    return "0";
  }
}
