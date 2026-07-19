import { LedgerError, LedgerErrorCode, normalizeLedgerError } from "../chrome/ledger/errors";
import * as signer from "./ledgerSigner";
import type { HdPathScheme, LedgerSignerStatus } from "./ledgerSigner";
import { isTrustedLedgerBackgroundSender } from "./messageAuthorization";

let activeOperationId: string | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "walletchan-ledger-offscreen") return false;
  if (!isTrustedLedgerBackgroundSender(sender)) {
    sendResponse({
      ok: false,
      error: serializeError(
        new LedgerError(
          LedgerErrorCode.UNKNOWN,
          "Unauthorized Ledger bridge request.",
        ),
      ),
    });
    return false;
  }
  handleMessage(message).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: serializeError(error) });
  });
  return true;
});

async function handleMessage(message: Record<string, unknown>) {
  const opId = typeof message.opId === "string" ? message.opId : "";
  const dispatch = makeDispatch(opId);
  if (message.type === "offscreen:ledgerCancel") {
    if (opId && activeOperationId === opId) signer.cancelActiveOperation();
    return { ok: true, payload: true };
  }
  try {
    if (!opId) {
      throw new LedgerError(LedgerErrorCode.UNKNOWN, "Missing Ledger operation ID.");
    }
    if (activeOperationId) {
      throw new LedgerError(
        LedgerErrorCode.TRANSPORT_BUSY,
        "Another Ledger operation is in progress.",
      );
    }
    activeOperationId = opId;
    let payload: unknown;
    switch (message.type) {
      case "offscreen:ledgerConnect":
        payload = await signer.connectLedger(message.productName as string | undefined, dispatch); break;
      case "offscreen:ledgerScan":
        payload = await signer.scanAddresses(
          message.deviceId as string, message.startIndex as number, message.count as number,
          message.scheme as HdPathScheme, message.customTemplate as string | undefined, dispatch,
        ); break;
      case "offscreen:ledgerSignTx":
        payload = await signer.signTransaction(
          message.deviceId as string, message.hdPath as string,
          message.unsignedTx as `0x${string}`, dispatch,
        ); break;
      case "offscreen:ledgerSignMessage":
        payload = await signer.signMessage(
          message.deviceId as string, message.hdPath as string,
          message.hex as `0x${string}`, dispatch,
        ); break;
      case "offscreen:ledgerSignTypedData":
        payload = await signer.signTypedData(
          message.deviceId as string, message.hdPath as string,
          message.typedData as Parameters<typeof signer.signTypedData>[2], dispatch,
        ); break;
      default:
        throw new LedgerError(LedgerErrorCode.UNKNOWN, "Unknown Ledger operation.");
    }
    return { ok: true, payload };
  } catch (error) {
    dispatch("error", { errorCode: normalizeLedgerError(error).code });
    return { ok: false, error: serializeError(error) };
  } finally {
    if (activeOperationId === opId) activeOperationId = null;
  }
}

function makeDispatch(opId?: string) {
  return (status: LedgerSignerStatus, extra?: Record<string, unknown>) => {
    if (!opId) return;
    chrome.runtime.sendMessage({
      type: "offscreenLedgerStatus", source: "walletchan-ledger-offscreen",
      opId, status, ...extra,
    }).catch(() => undefined);
  };
}

function serializeError(error: unknown) {
  const normalized = normalizeLedgerError(error);
  return {
    code: normalized.code,
    userMessage: normalized.userMessage,
    technicalMessage: normalized.technicalMessage,
  };
}
