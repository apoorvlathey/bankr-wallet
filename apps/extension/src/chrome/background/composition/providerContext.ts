/** Shared provider-ingress helpers composed once for the ordered pipeline. */

import { getResolvedChainById } from "@/lib/chains";
import {
  RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
  validateEIP712TypedData,
} from "../../eip712Validator";
import {
  ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR,
  isErc7715PermissionRequestLocked,
} from "../../erc7715/requestLock";
import { authorizeConnectedDappRequest } from "../../dapp/requestPolicy";
import {
  handleSignatureRequest,
  showNotification,
  writeResultToStorage,
} from "../../txHandlers";
import { createDappChainSwitchNotificationHandler } from "../chainSwitchNotification";
import { createBackgroundProviderIngressHelpers } from "../providerIngress";
import { createEnqueueAuthorizedSignatureRequest } from "../signatureValidation";

export function createProviderContextComposition() {
  const handleDappChainSwitchNotification =
    createDappChainSwitchNotificationHandler({
      getNetworksInfo: async () =>
        (await chrome.storage.sync.get("networksInfo")).networksInfo,
      getResolvedChainById,
      sendRuntimeMessage: (runtimeMessage) =>
        chrome.runtime.sendMessage(runtimeMessage),
      showNotification,
      getRuntimeUrl: (path) => chrome.runtime.getURL(path),
      now: Date.now,
    });

  const providerIngress = createBackgroundProviderIngressHelpers({
    authorizeConnectedDappRequest,
    writeResultToStorage,
    isErc7715PermissionRequestLocked,
    erc7715PermissionRequestInProgressError:
      ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR,
  });

  const enqueueAuthorizedSignatureRequest =
    createEnqueueAuthorizedSignatureRequest({
      validateEIP712TypedData,
      rawErc7710DelegationSignatureError:
        RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
      writeResultToStorage,
      handleSignatureRequest,
      warn: (...args) => console.warn(...args),
    });

  return {
    ...providerIngress,
    enqueueAuthorizedSignatureRequest,
    handleDappChainSwitchNotification,
  };
}

export type ProviderContextComposition = ReturnType<
  typeof createProviderContextComposition
>;
