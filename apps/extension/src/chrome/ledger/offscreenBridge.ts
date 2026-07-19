import { LedgerError, LedgerErrorCode, normalizeLedgerError } from "./errors";

const OFFSCREEN_URL = "offscreen.html";
const TARGET = "walletchan-ledger-offscreen";
const IDLE_MS = 30_000;
let creationPromise: Promise<void> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let activeRequests = 0;

export type LedgerStatusUpdate = {
  opId: string;
  status: "connecting" | "awaiting-app" | "scanning" | "awaiting-confirmation" | "signing" | "success" | "error";
  errorCode?: string;
  interaction?: string;
};

export async function ensureLedgerOffscreen(): Promise<void> {
  if (!chrome.offscreen || !chrome.runtime.getContexts) {
    throw new LedgerError(
      LedgerErrorCode.OFFSCREEN_UNAVAILABLE,
      "Ledger support requires Chrome 124 or newer.",
    );
  }
  const documentUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [documentUrl],
  });
  if (contexts.length) return;
  if (!creationPromise) {
    creationPromise = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Communicate with a Ledger hardware wallet over WebHID",
    }).finally(() => { creationPromise = null; });
  }
  await creationPromise;
}

async function send<T>(type: string, body: Record<string, unknown>): Promise<T> {
  await ensureLedgerOffscreen();
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  activeRequests += 1;
  try {
    const response = await chrome.runtime.sendMessage({ type, target: TARGET, ...body }) as {
      ok?: boolean; payload?: T;
      error?: { code?: string; userMessage?: string; technicalMessage?: string };
    };
    if (response?.ok) return response.payload as T;
    throw new LedgerError(
      (response?.error?.code as LedgerErrorCode) || LedgerErrorCode.UNKNOWN,
      response?.error?.userMessage || "Ledger operation failed.",
      response?.error?.technicalMessage,
    );
  } catch (error) {
    throw normalizeLedgerError(error);
  } finally {
    activeRequests -= 1;
    scheduleTeardown();
  }
}

function scheduleTeardown(): void {
  if (activeRequests || idleTimer) return;
  idleTimer = setTimeout(async () => {
    idleTimer = null;
    if (activeRequests || !chrome.offscreen) return;
    try { await chrome.offscreen.closeDocument(); } catch { /* already closed */ }
  }, IDLE_MS);
}

export function connectLedger(opId: string, productName?: string) {
  return send<{ deviceId: string; deviceLabel: string; deviceModel: string }>(
    "offscreen:ledgerConnect", { opId, productName },
  );
}

export function scanLedgerAddresses(input: {
  opId: string; deviceId: string; startIndex: number; count: number;
  scheme: "ledgerLive" | "bip44" | "legacyMew" | "custom"; customTemplate?: string;
}) {
  return send<Array<{ hdPath: string; hdIndex: number; address: `0x${string}` }>>(
    "offscreen:ledgerScan", input,
  );
}

export function signLedgerTransaction(input: {
  opId: string; deviceId: string; hdPath: string; unsignedTx: `0x${string}`;
}) {
  return send<{ r: `0x${string}`; s: `0x${string}`; v: number }>(
    "offscreen:ledgerSignTx", input,
  );
}

export function signLedgerMessage(input: {
  opId: string; deviceId: string; hdPath: string; hex: `0x${string}`;
}) {
  return send<{ r: `0x${string}`; s: `0x${string}`; v: number }>(
    "offscreen:ledgerSignMessage", input,
  );
}

export function signLedgerTypedData(input: {
  opId: string; deviceId: string; hdPath: string; typedData: Record<string, unknown>;
}) {
  return send<{ r: `0x${string}`; s: `0x${string}`; v: number }>(
    "offscreen:ledgerSignTypedData", input,
  );
}

export async function cancelLedgerOperation(opId: string): Promise<void> {
  await send("offscreen:ledgerCancel", { opId });
}
