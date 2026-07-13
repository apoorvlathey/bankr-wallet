import type { TransactionParams } from "../bankrApi";
import { CHAIN_NAMES } from "../../constants/networks";
import { CHAIN_REGISTRY } from "../../constants/chainRegistry";
import { getActiveAccount, getTabAccount } from "../accountStorage";
import {
  isRawErc7710DelegationSignatureRequest,
  RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
} from "../eip712Validator";
import { openExtensionPopup } from "../extensionPopup";
import {
  type SignatureParams,
  savePendingSignatureRequest,
} from "../pendingSignatureStorage";
import { savePendingTxRequest } from "../pendingTxStorage";
import {
  pinnedSignatureRequest,
  pinnedTxRequest,
} from "../pinnedRequest";
import { extractSignerParam } from "../signatures/requestSigner";
import { normalizeTransactionValue } from "../transactionValidation";
import { writeResultToStorage } from "./runtime";

const CHAIN_BY_ID_TX = new Map(
  CHAIN_REGISTRY.map((chain) => [chain.chainId, chain]),
);

/** Captures and persists an incoming transaction request without signing it. */
export function handleTransactionRequest(
  message: {
    type: string;
    tx: TransactionParams;
    origin: string;
    favicon?: string | null;
  },
  txId: string,
  senderWindowId?: number,
  senderOrigin?: string,
  tabId?: number,
  frameId?: number,
): void {
  const { tx, origin, favicon } = message;

  (async () => {
    const chainName = CHAIN_NAMES[tx.chainId] || `Chain ${tx.chainId}`;
    const activeAccount =
      typeof tabId === "number"
        ? await getTabAccount(tabId)
        : await getActiveAccount();
    if (!activeAccount) {
      await writeResultToStorage(`txResult:${txId}`, {
        success: false,
        error: "No active account",
      });
      return;
    }

    if (
      typeof tx.from === "string" &&
      tx.from.length > 0 &&
      tx.from.toLowerCase() !== activeAccount.address.toLowerCase()
    ) {
      await writeResultToStorage(`txResult:${txId}`, {
        success: false,
        error: "Transaction 'from' does not match active account",
      });
      return;
    }

    const normalizedValue = normalizeTransactionValue(tx.value);
    if (!normalizedValue.ok) {
      await writeResultToStorage(`txResult:${txId}`, {
        success: false,
        error: normalizedValue.error,
      });
      return;
    }

    const txWithNormalizedValue: TransactionParams = {
      ...tx,
      value: normalizedValue.value,
    };
    const sanitizedTx = CHAIN_BY_ID_TX.get(tx.chainId)?.usesNonStandardGasModel
      ? { ...txWithNormalizedValue, gas: undefined }
      : txWithNormalizedValue;

    const pendingRequest = pinnedTxRequest(activeAccount, {
      id: txId,
      tx: sanitizedTx,
      origin,
      favicon: favicon || null,
      chainName,
      timestamp: Date.now(),
      tabId,
      frameId,
      senderOrigin,
      requestChainId: tx.chainId,
    });

    await savePendingTxRequest(pendingRequest);
    chrome.runtime
      .sendMessage({ type: "newPendingTxRequest", txRequest: pendingRequest })
      .catch(() => {});
    openExtensionPopup(senderWindowId);
  })().catch((error) => {
    void writeResultToStorage(`txResult:${txId}`, {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to queue transaction request",
    }).catch(() => undefined);
  });
}

/** Captures and persists an incoming signature request without signing it. */
export function handleSignatureRequest(
  message: {
    type: string;
    signature: SignatureParams;
    origin: string;
    favicon?: string | null;
  },
  sigId: string,
  senderWindowId?: number,
  senderOrigin?: string,
  tabId?: number,
  frameId?: number,
): void {
  const { signature, origin, favicon } = message;

  (async () => {
    const chainName =
      CHAIN_NAMES[signature.chainId] || `Chain ${signature.chainId}`;
    const activeAccount =
      typeof tabId === "number"
        ? await getTabAccount(tabId)
        : await getActiveAccount();
    if (!activeAccount) {
      await writeResultToStorage(`sigResult:${sigId}`, {
        success: false,
        error: "No active account",
      });
      return;
    }

    const signerParam = extractSignerParam(
      signature.method,
      signature.params,
    );
    if (
      typeof signerParam === "string" &&
      signerParam.length > 0 &&
      signerParam.toLowerCase() !== activeAccount.address.toLowerCase()
    ) {
      await writeResultToStorage(`sigResult:${sigId}`, {
        success: false,
        error: "Signer address does not match active account",
      });
      return;
    }

    if (
      signature.method === "eth_signTypedData_v3" ||
      signature.method === "eth_signTypedData_v4"
    ) {
      let typedData: any = signature.params?.[1];
      if (typeof typedData === "string") {
        try {
          typedData = JSON.parse(typedData);
        } catch {
          // Validation already ran before intake; leave malformed data as-is.
        }
      }
      const domainChainId = typedData?.domain?.chainId;
      if (domainChainId !== undefined && domainChainId !== null) {
        const numDomainChainId = Number(domainChainId);
        if (
          Number.isFinite(numDomainChainId) &&
          numDomainChainId !== signature.chainId
        ) {
          await writeResultToStorage(`sigResult:${sigId}`, {
            success: false,
            error: `Provided chainId "${numDomainChainId}" must match the active chainId "${signature.chainId}"`,
          });
          return;
        }
      }

      if (
        isRawErc7710DelegationSignatureRequest(
          signature.method,
          signature.params?.[1],
        )
      ) {
        await writeResultToStorage(`sigResult:${sigId}`, {
          success: false,
          error: RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
        });
        return;
      }
    }

    const pendingRequest = pinnedSignatureRequest(activeAccount, {
      id: sigId,
      signature,
      origin,
      favicon: favicon || null,
      chainName,
      timestamp: Date.now(),
      tabId,
      frameId,
      senderOrigin,
      requestChainId: signature.chainId,
    });

    await savePendingSignatureRequest(pendingRequest);
    chrome.runtime
      .sendMessage({
        type: "newPendingSignatureRequest",
        sigRequest: pendingRequest,
      })
      .catch(() => {});
    openExtensionPopup(senderWindowId);
  })().catch((error) => {
    void writeResultToStorage(`sigResult:${sigId}`, {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to queue signature request",
    }).catch(() => undefined);
  });
}
