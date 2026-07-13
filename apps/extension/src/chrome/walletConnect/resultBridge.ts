/** Bridges durable injected-request results back to their WalletConnect route. */

import { getWalletConnectPendingRequest } from "./storage";
import {
  rejectSessionRequest as rejectRoutedSessionRequest,
  respondSessionRequest as respondRoutedSessionRequest,
} from "./protocol";
import { ensureWalletKit } from "./client";

export async function completeWalletConnectRequestIfNeeded(
  key: string,
  result: Record<string, unknown>,
): Promise<void> {
  const txPrefix = "txResult:";
  const sigPrefix = "sigResult:";
  const erc7715Prefix = "erc7715PermissionResult:";
  const id = key.startsWith(txPrefix)
    ? key.slice(txPrefix.length)
    : key.startsWith(sigPrefix)
      ? key.slice(sigPrefix.length)
      : key.startsWith(erc7715Prefix)
        ? key.slice(erc7715Prefix.length)
        : null;
  if (!id) return;

  const pending = await getWalletConnectPendingRequest(id);
  if (!pending) return;

  try {
    const kit = await ensureWalletKit();
    const args = { topic: pending.topic, id: pending.requestId };
    const payload =
      pending.kind === "transaction"
        ? result.txHash
        : pending.kind === "signature"
          ? result.signature
          : result.result;
    if (
      result.success === true &&
      (typeof payload === "string" || Array.isArray(payload))
    ) {
      await respondRoutedSessionRequest(kit, args, payload);
    } else {
      const error =
        typeof result.error === "string" ? result.error : "Request failed";
      await rejectRoutedSessionRequest(
        kit,
        args,
        /reject|cancel/i.test(error) ? 4001 : -32000,
        error,
      );
    }
  } catch (error) {
    console.warn(
      "[WalletConnect] Response delivery deferred; terminal outbox retained",
      error,
    );
  }
}
