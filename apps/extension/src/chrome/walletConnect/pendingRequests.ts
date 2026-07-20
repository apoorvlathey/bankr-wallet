/** Creates account-pinned local confirmation prompts for WalletConnect. */

import { getStoredChainName } from "@/lib/chains";
import {
  RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
  validateEIP712TypedData,
} from "../eip712Validator";
import type { TransactionParams } from "../bankr/client";
import { savePendingTxRequest } from "../requests/pendingTxStorage";
import {
  savePendingSignatureRequest,
  type SignatureMethod,
  type SignatureParams,
} from "../requests/pendingSignatureStorage";
import { pinnedSignatureRequest, pinnedTxRequest } from "../requests/pinnedRequest";
import { openExtensionPopup } from "../txHandlers";
import { normalizeTransactionValue } from "../transactionValidation";
import { withWalletConnectPendingRoute } from "./storage";
import {
  getSessionMetadata,
  isAddress,
  parseWalletChainId,
  requestSignerAddress,
  resolveSessionSigningAccount,
  resolveSessionAccount,
} from "./sessionPolicy";
import type { WalletKitLike } from "./protocol";
import { createReviewedSafeProposal } from "../safe/proposalLifecycle";
import { requireSafeFeature } from "../safe/featurePolicy";

export async function createPendingTransactionRequest(
  kit: WalletKitLike,
  args: any,
  requestParams: any[],
  chainId: number,
  remoteClaimId: string,
): Promise<void> {
  const rawTx = requestParams[0] || {};
  const account = await resolveSessionAccount(
    kit.getActiveSessions()?.[args.topic],
    chainId,
    isAddress(rawTx.from) ? rawTx.from : null,
  );
  if (
    isAddress(rawTx.from) &&
    rawTx.from.toLowerCase() !== account.address.toLowerCase()
  ) {
    throw new Error("Transaction 'from' does not match session account");
  }
  const rawChainId = parseWalletChainId(rawTx.chainId);
  if (rawChainId && rawChainId !== chainId) {
    throw new Error("Transaction chainId does not match session chain");
  }

  const txId = crypto.randomUUID();
  const peer = getSessionMetadata(kit.getActiveSessions()?.[args.topic]);
  const chainName = await getStoredChainName(chainId);
  const normalizedValue = normalizeTransactionValue(rawTx.value);
  if (!normalizedValue.ok) {
    throw new Error(normalizedValue.error);
  }
  const tx: TransactionParams = {
    from: account.address,
    to: isAddress(rawTx.to) ? rawTx.to : null,
    data: typeof rawTx.data === "string" ? rawTx.data : "0x",
    value: normalizedValue.value,
    chainId,
    ...(typeof rawTx.gas === "string" ? { gas: rawTx.gas } : {}),
    ...(typeof rawTx.gasPrice === "string"
      ? { gasPrice: rawTx.gasPrice }
      : {}),
    ...(typeof rawTx.maxFeePerGas === "string"
      ? { maxFeePerGas: rawTx.maxFeePerGas }
      : {}),
    ...(typeof rawTx.maxPriorityFeePerGas === "string"
      ? { maxPriorityFeePerGas: rawTx.maxPriorityFeePerGas }
      : {}),
  };

  if (account.type === "safe") {
    requireSafeFeature("walletConnect");
    requireSafeFeature("sendProposal");
    if (!tx.to) throw new Error("Safe contract creation is unsupported");
    const proposal = await withWalletConnectPendingRoute(
      {
        id: txId,
        kind: "transaction",
        topic: args.topic,
        requestId: args.id,
        method: "eth_sendTransaction",
        timestamp: Date.now(),
      },
      () => createReviewedSafeProposal({
        safeAccountId: account.id,
        chainId,
        calls: [{ to: tx.to as `0x${string}`, value: tx.value as `${bigint}`, data: tx.data as `0x${string}`, operation: 0 }],
        route: { kind: "walletConnect", origin: peer.url || peer.name, topic: args.topic, requestId: txId },
      }),
      remoteClaimId,
    );
    chrome.runtime.sendMessage({ type: "newSafeProposalRequest", proposalId: proposal.id }).catch(() => {});
    await openExtensionPopup().catch(() => undefined);
    return;
  }

  const pendingRequest = pinnedTxRequest(account, {
    id: txId,
    tx,
    origin: peer.url || peer.name,
    favicon: peer.icon,
    chainName,
    timestamp: Date.now(),
    senderOrigin: peer.url || undefined,
    requestChainId: chainId,
    walletConnect: {
      topic: args.topic,
      requestId: args.id,
      method: "eth_sendTransaction",
      peerName: peer.name,
      peerUrl: peer.url,
      peerIcon: peer.icon,
    },
  });

  await withWalletConnectPendingRoute(
    {
      id: txId,
      kind: "transaction",
      topic: args.topic,
      requestId: args.id,
      method: "eth_sendTransaction",
      timestamp: Date.now(),
    },
    () => savePendingTxRequest(pendingRequest),
    remoteClaimId,
  );
  chrome.runtime
    .sendMessage({ type: "newPendingTxRequest", txRequest: pendingRequest })
    .catch(() => {});
  await openExtensionPopup().catch((error) => {
    console.warn(
      "[WalletConnect] Failed to open transaction confirmation",
      error,
    );
  });
}

export async function createPendingSignatureRequest(
  kit: WalletKitLike,
  args: any,
  method: SignatureMethod,
  requestParams: any[],
  chainId: number,
  remoteClaimId: string,
): Promise<void> {
  if (method === "eth_sign") {
    throw new Error(
      "eth_sign is deprecated and unsafe; use personal_sign or eth_signTypedData_v4",
    );
  }
  if (method === "eth_signTypedData") {
    throw new Error(
      "eth_signTypedData (v1) is deprecated; please use eth_signTypedData_v4",
    );
  }

  const params = [...requestParams];
  if (
    method === "eth_signTypedData_v3" ||
    method === "eth_signTypedData_v4"
  ) {
    const validation = validateEIP712TypedData(method, params[1]);
    if (!validation.valid) {
      throw new Error(
        validation.error === RAW_ERC7710_DELEGATION_SIGNATURE_ERROR
          ? RAW_ERC7710_DELEGATION_SIGNATURE_ERROR
          : "Data must conform to EIP-712 schema",
      );
    }
    if (validation.sanitized) params[1] = validation.sanitized;
  }

  const account = await resolveSessionSigningAccount(
    kit.getActiveSessions()?.[args.topic],
    chainId,
    requestSignerAddress(method, params),
  );
  const sigId = crypto.randomUUID();
  const peer = getSessionMetadata(kit.getActiveSessions()?.[args.topic]);
  const chainName = await getStoredChainName(chainId);
  const signature: SignatureParams = { method, params, chainId };

  const pendingRequest = pinnedSignatureRequest(account, {
    id: sigId,
    signature,
    origin: peer.url || peer.name,
    favicon: peer.icon,
    chainName,
    timestamp: Date.now(),
    senderOrigin: peer.url || undefined,
    requestChainId: chainId,
    walletConnect: {
      topic: args.topic,
      requestId: args.id,
      method,
      peerName: peer.name,
      peerUrl: peer.url,
      peerIcon: peer.icon,
    },
  });

  await withWalletConnectPendingRoute(
    {
      id: sigId,
      kind: "signature",
      topic: args.topic,
      requestId: args.id,
      method,
      timestamp: Date.now(),
    },
    () => savePendingSignatureRequest(pendingRequest),
    remoteClaimId,
  );
  chrome.runtime
    .sendMessage({
      type: "newPendingSignatureRequest",
      sigRequest: pendingRequest,
    })
    .catch(() => {});
  await openExtensionPopup().catch((error) => {
    console.warn(
      "[WalletConnect] Failed to open signature confirmation",
      error,
    );
  });
}
