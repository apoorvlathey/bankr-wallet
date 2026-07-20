import type { TransactionParams } from "../bankr/submission";
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
} from "../requests/pendingSignatureStorage";
import { savePendingTxRequest } from "../requests/pendingTxStorage";
import {
  pinnedSignatureRequest,
  pinnedTxRequest,
} from "../requests/pinnedRequest";
import { extractSignerParam } from "../signatures/requestSigner";
import { normalizeTransactionValue } from "../transactionValidation";
import { clearProviderRequestSurfaceHint } from "../windowing/providerRequestSurface";
import { writeResultToStorage } from "./runtime";
import { createReviewedSafeProposal } from "../safe/proposalLifecycle";
import { requireSafeFeature } from "../safe/featurePolicy";

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
    if (activeAccount.type === "safe") {
      requireSafeFeature("injectedDapp");
      requireSafeFeature("sendProposal");
      if (
        typeof tx.from === "string" &&
        tx.from.length > 0 &&
        tx.from.toLowerCase() !== activeAccount.address.toLowerCase()
      ) {
        await writeResultToStorage(`txResult:${txId}`, {
          success: false,
          error: "Transaction 'from' does not match active Safe",
        });
        return;
      }
      const normalizedValue = normalizeTransactionValue(tx.value);
      if (!normalizedValue.ok || !tx.to) {
        await writeResultToStorage(`txResult:${txId}`, {
          success: false,
          error: normalizedValue.ok ? "Safe contract creation is unsupported" : normalizedValue.error,
        });
        return;
      }
      const proposal = await createReviewedSafeProposal({
        safeAccountId: activeAccount.id,
        chainId: tx.chainId,
        calls: [{
          to: tx.to as `0x${string}`,
          value: normalizedValue.value as `${bigint}`,
          data: (tx.data || "0x") as `0x${string}`,
          operation: 0,
        }],
        route: {
          kind: "injected",
          origin,
          tabId,
          frameId,
          requestId: txId,
        },
      });
      clearProviderRequestSurfaceHint(senderWindowId);
      chrome.runtime.sendMessage({ type: "newSafeProposalRequest", proposalId: proposal.id }).catch(() => {});
      openExtensionPopup(senderWindowId);
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
    clearProviderRequestSurfaceHint(senderWindowId);
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
    if (activeAccount.type === "safe") {
      await writeResultToStorage(`sigResult:${sigId}`, {
        success: false,
        error: "Safe message signing is not supported yet",
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
    clearProviderRequestSurfaceHint(senderWindowId);
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
