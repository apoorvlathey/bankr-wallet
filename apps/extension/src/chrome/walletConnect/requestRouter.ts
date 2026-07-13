import { getStoredChainName } from "@/lib/chains";
import {
  RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
  validateEIP712TypedData,
} from "../eip712Validator";
import {
  handleErc7715PermissionMethod,
  isErc7715PermissionMethod,
} from "../erc7715PermissionHandlers";
import {
  ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR,
  isErc7715PermissionRequestLocked,
} from "../erc7715/requestLock";
import type { TransactionParams } from "../bankrApi";
import {
  handleWalletConnectGetCallsStatus,
  handleWalletConnectGetCapabilities,
  handleWalletConnectSendCalls,
  handleWalletConnectShowCallsStatus,
} from "./batchRequests";
import { savePendingTxRequest } from "../pendingTxStorage";
import {
  savePendingSignatureRequest,
  type SignatureMethod,
  type SignatureParams,
} from "../pendingSignatureStorage";
import { pinnedSignatureRequest, pinnedTxRequest } from "../pinnedRequest";
import { openExtensionPopup } from "../txHandlers";
import { normalizeTransactionValue } from "../transactionValidation";
import {
  claimWalletConnectRemoteRequest,
  withWalletConnectPendingRoute,
} from "./storage";
import {
  WALLETCONNECT_SAFE_RPC_METHODS,
  chainIdFromCaip2,
  getSessionAccounts,
  getSessionMetadata,
  isAddress,
  isSignatureMethod,
  parseWalletChainId,
  requestSignerAddress,
  resolveSessionSigningAccount,
  sessionSupportsMethod,
  toHexChainId,
} from "./sessionPolicy";
import { syncWalletConnectChainFromRequest } from "./chainState";
import {
  forwardSafeRpcRequest,
  handleAddEthereumChain,
  handleSwitchEthereumChain,
} from "./rpcRequests";
import {
  rejectDuplicateSessionRequest,
  rejectSessionRequest,
  rejectUnroutedSessionRequest,
  replayWalletConnectTerminalResponse,
  respondSessionRequest,
  type WalletKitLike,
} from "./protocol";
import { validateWalletConnectRequestPayload } from "./requestValidation";

function getAuthorizedAccounts(
  kit: WalletKitLike,
  topic: string,
  chainId: number,
): string[] {
  return getSessionAccounts(kit.getActiveSessions()?.[topic], chainId);
}

function requestedErc7715Account(method: string, params: any[]): string | null {
  if (method !== "wallet_requestExecutionPermissions") return null;
  const request = params[0];
  return isAddress(request?.from) ? request.from : null;
}

function walletConnectPermissionOrigin(topic: string): string {
  return `walletconnect:${topic}`;
}

export async function handleWalletConnectSessionRequest(
  kit: WalletKitLike,
  args: any,
): Promise<void> {
  const method = args?.params?.request?.method;
  if (typeof method !== "string" || !method) {
    await rejectUnroutedSessionRequest(
      kit,
      args,
      -32602,
      "Invalid WalletConnect request",
    );
    return;
  }

  let remoteClaim;
  try {
    remoteClaim = await claimWalletConnectRemoteRequest(
      args.topic,
      args.id,
      method,
    );
  } catch (error) {
    await rejectUnroutedSessionRequest(
      kit,
      args,
      -32602,
      error instanceof Error ? error.message : "Invalid WalletConnect request",
    );
    return;
  }
  if (!remoteClaim.acquired) {
    if (remoteClaim.existing.terminalResponse) {
      await replayWalletConnectTerminalResponse(kit, remoteClaim.existing);
    } else {
      await rejectDuplicateSessionRequest(kit, args);
    }
    return;
  }
  const remoteClaimId = remoteClaim.claimId;

  try {
    const rawRequestParams = args?.params?.request?.params;
    const chainId = chainIdFromCaip2(args?.params?.chainId);
    if (!chainId) {
      await rejectSessionRequest(
        kit,
        args,
        -32602,
        "Invalid WalletConnect request",
      );
      return;
    }
    const requestValidation = validateWalletConnectRequestPayload(
      method,
      rawRequestParams ?? [],
    );
    if (!requestValidation.valid) {
      await rejectSessionRequest(
        kit,
        args,
        -32602,
        requestValidation.error || "Invalid WalletConnect request",
      );
      return;
    }
    const requestParams = (rawRequestParams ?? []) as any[];
    const session = kit.getActiveSessions()?.[args.topic];
    if (!sessionSupportsMethod(session, method)) {
      await rejectSessionRequest(
        kit,
        args,
        4100,
        `Method was not approved for this session: ${method}`,
      );
      return;
    }

    if (isErc7715PermissionRequestLocked()) {
      await rejectSessionRequest(
        kit,
        args,
        -32002,
        ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR,
      );
      return;
    }

    if (
      method !== "wallet_switchEthereumChain" &&
      method !== "wallet_addEthereumChain"
    ) {
      await syncWalletConnectChainFromRequest(kit, chainId);
    }

    if (method === "eth_sendTransaction") {
      await createPendingTransactionRequest(
        kit,
        args,
        requestParams,
        chainId,
        remoteClaimId,
      );
      return;
    }
    if (method === "wallet_getCapabilities") {
      await handleWalletConnectGetCapabilities(kit, args, requestParams, chainId);
      return;
    }
    if (method === "wallet_sendCalls") {
      await handleWalletConnectSendCalls(kit, args, requestParams, chainId);
      return;
    }
    if (method === "wallet_getCallsStatus") {
      await handleWalletConnectGetCallsStatus(kit, args, requestParams);
      return;
    }
    if (method === "wallet_showCallsStatus") {
      await handleWalletConnectShowCallsStatus(kit, args, requestParams);
      return;
    }
    if (isErc7715PermissionMethod(method)) {
      const account = await resolveSessionSigningAccount(
        session,
        chainId,
        requestedErc7715Account(method, requestParams),
      );
      const peer = getSessionMetadata(session);
      if (method === "wallet_requestExecutionPermissions") {
        const permissionRequestId = crypto.randomUUID();
        await withWalletConnectPendingRoute(
          {
            id: permissionRequestId,
            kind: "erc7715Permission",
            topic: args.topic,
            requestId: args.id,
            method,
            timestamp: Date.now(),
          },
          () => handleErc7715PermissionMethod({
            method,
            params: requestParams,
            origin: walletConnectPermissionOrigin(args.topic),
            favicon: peer.icon || null,
            chainId,
            account,
            senderOrigin: peer.url || peer.name,
            requestId: permissionRequestId,
            waitForResult: false,
          }),
          remoteClaimId,
        );
        return;
      }

      await respondSessionRequest(
        kit,
        args,
        await handleErc7715PermissionMethod({
          method,
          params: requestParams,
          origin: walletConnectPermissionOrigin(args.topic),
          favicon: peer.icon || null,
          chainId,
          account,
          senderOrigin: peer.url || peer.name,
        }),
      );
      return;
    }
    if (isSignatureMethod(method)) {
      await createPendingSignatureRequest(
        kit,
        args,
        method,
        requestParams,
        chainId,
        remoteClaimId,
      );
      return;
    }
    if (method === "eth_accounts" || method === "eth_requestAccounts") {
      await respondSessionRequest(
        kit,
        args,
        getAuthorizedAccounts(kit, args.topic, chainId),
      );
      return;
    }
    if (method === "eth_chainId") {
      await respondSessionRequest(kit, args, toHexChainId(chainId));
      return;
    }
    if (method === "net_version") {
      await respondSessionRequest(kit, args, String(chainId));
      return;
    }
    if (method === "wallet_switchEthereumChain") {
      await handleSwitchEthereumChain(kit, args, requestParams);
      return;
    }
    if (method === "wallet_addEthereumChain") {
      await handleAddEthereumChain(kit, args, requestParams);
      return;
    }
    if (WALLETCONNECT_SAFE_RPC_METHODS.has(method)) {
      await respondSessionRequest(
        kit,
        args,
        await forwardSafeRpcRequest(chainId, method, requestParams),
      );
      return;
    }
    await rejectSessionRequest(kit, args, -32601, `Unsupported method: ${method}`);
  } catch (error) {
    await rejectSessionRequest(
      kit,
      args,
      -32000,
      error instanceof Error ? error.message : "WalletConnect request failed",
    );
  }
}

async function createPendingTransactionRequest(
  kit: WalletKitLike,
  args: any,
  requestParams: any[],
  chainId: number,
  remoteClaimId: string,
): Promise<void> {
  const rawTx = requestParams[0] || {};
  const account = await resolveSessionSigningAccount(
    kit.getActiveSessions()?.[args.topic],
    chainId,
    isAddress(rawTx.from) ? rawTx.from : null,
  );
  if (isAddress(rawTx.from) && rawTx.from.toLowerCase() !== account.address.toLowerCase()) {
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
    ...(typeof rawTx.gasPrice === "string" ? { gasPrice: rawTx.gasPrice } : {}),
    ...(typeof rawTx.maxFeePerGas === "string"
      ? { maxFeePerGas: rawTx.maxFeePerGas }
      : {}),
    ...(typeof rawTx.maxPriorityFeePerGas === "string"
      ? { maxPriorityFeePerGas: rawTx.maxPriorityFeePerGas }
      : {}),
  };

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
    console.warn("[WalletConnect] Failed to open transaction confirmation", error);
  });
}

async function createPendingSignatureRequest(
  kit: WalletKitLike,
  args: any,
  method: SignatureMethod,
  requestParams: any[],
  chainId: number,
  remoteClaimId: string,
): Promise<void> {
  if (method === "eth_sign") {
    throw new Error("eth_sign is deprecated and unsafe; use personal_sign or eth_signTypedData_v4");
  }
  if (method === "eth_signTypedData") {
    throw new Error("eth_signTypedData (v1) is deprecated; please use eth_signTypedData_v4");
  }

  const params = [...requestParams];
  if (method === "eth_signTypedData_v3" || method === "eth_signTypedData_v4") {
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
    console.warn("[WalletConnect] Failed to open signature confirmation", error);
  });
}
