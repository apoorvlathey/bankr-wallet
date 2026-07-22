import {
  isPrivacyProverBackgroundSender,
  parsePrivacyProverOffscreenRequest,
  parsePrivacyProverProofResult,
  parsePrivacyProverSelfTestResult,
  PRIVACY_PROVER_OFFSCREEN_TARGET,
  PRIVACY_PROVER_TIMEOUT_MS,
  type PrivacyProverSelfTestFailure,
  type PrivacyProverSelfTestRequest,
  type PrivacyProverSelfTestResult,
  type PrivacyProverProofRequest,
  type PrivacyProverProofResult,
} from "./messages";

const nonce = new URLSearchParams(location.search).get("nonce") || "";
let activeWorker: Worker | null = null;
let activeRequestId: string | null = null;

function failure(
  request: PrivacyProverSelfTestRequest | PrivacyProverProofRequest,
  code: PrivacyProverSelfTestFailure["code"] = "worker-launch-failed",
): PrivacyProverSelfTestFailure | PrivacyProverProofResult {
  return request.action === "fixed-self-test"
    ? { version: 1, id: request.id, kind: "result", ok: false, code }
    : {
        version: 1,
        id: request.id,
        kind: "result",
        action: request.action,
        ok: false,
        code,
      };
}

function isBackgroundSender(sender: chrome.runtime.MessageSender): boolean {
  return isPrivacyProverBackgroundSender(
    sender,
    chrome.runtime.id,
    chrome.runtime.getURL("static/js/background.js"),
  );
}

function runWorker(
  request: PrivacyProverSelfTestRequest | PrivacyProverProofRequest,
): Promise<PrivacyProverSelfTestResult | PrivacyProverProofResult> {
  if (activeWorker) return Promise.resolve(failure(request));

  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
        name: "walletchan-privacy-prover",
      });
    } catch {
      resolve(failure(request));
      return;
    }
    activeWorker = worker;
    activeRequestId = request.id;

    const finish = (
      result: PrivacyProverSelfTestResult | PrivacyProverProofResult,
    ): void => {
      if (activeRequestId !== request.id) return;
      clearTimeout(timeout);
      worker.terminate();
      activeWorker = null;
      activeRequestId = null;
      resolve(result);
    };
    const timeout = setTimeout(
      () => finish(failure(request, "worker-timeout")),
      PRIVACY_PROVER_TIMEOUT_MS - 5_000,
    );
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const result = request.action === "fixed-self-test"
        ? parsePrivacyProverSelfTestResult(event.data)
        : parsePrivacyProverProofResult(event.data);
      if (result?.id === request.id) finish(result);
    });
    worker.addEventListener("error", () =>
      finish(failure(request, "worker-runtime-failed"))
    );
    try {
      worker.postMessage(request);
    } catch {
      finish(failure(request, "worker-message-failed"));
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    !nonce ||
    !isBackgroundSender(sender) ||
    (message as { target?: unknown })?.target !==
      PRIVACY_PROVER_OFFSCREEN_TARGET
  ) {
    return false;
  }
  const envelope = parsePrivacyProverOffscreenRequest(message, nonce);
  if (!envelope) {
    sendResponse({
      version: 1,
      id: "00000000-0000-4000-8000-000000000000",
      kind: "result",
      ok: false,
      code: "worker-launch-failed",
    } satisfies PrivacyProverSelfTestFailure);
    return false;
  }
  void runWorker(envelope.request).then(sendResponse);
  return true;
});

addEventListener("unload", () => {
  activeWorker?.terminate();
  activeWorker = null;
  activeRequestId = null;
});
