import { handleAccountChainPageMessage } from "./accountChainRoutes";
import { handleErc5792PageMessage } from "./erc5792Routes";
import { handleExecutionPermissionPageMessage } from "./executionPermissionRoute";
import { acceptedPageMessageType } from "./messagePolicy";
import { requestFullscreenTransactionSidePanel } from "./requestSurface";
import { handleSigningPageMessage } from "./signingRoutes";

export function installPageToRuntimeBridge(): void {
  window.addEventListener("message", async (event) => {
    const type = acceptedPageMessageType(event);
    if (!type) return;
    const msg = event.data.msg;
    requestFullscreenTransactionSidePanel(type);
    if (await handleAccountChainPageMessage(type, msg)) return;
    if (await handleSigningPageMessage(type, msg)) return;
    if (await handleErc5792PageMessage(type, msg)) return;
    await handleExecutionPermissionPageMessage(type, msg);
  });
}
