import {
  parsePrivacyProverSelfTestResult,
  parsePrivacyProverProofRequest,
  parsePrivacyProverProofResult,
  PRIVACY_PROVER_FAILURE_CODES,
  PRIVACY_PROVER_OFFSCREEN_PATH,
  PRIVACY_PROVER_OFFSCREEN_TARGET,
  PRIVACY_PROVER_TIMEOUT_MS,
  type PrivacyProverOffscreenRequest,
  type PrivacyProverSelfTestRequest,
  type PrivacyProverSelfTestSuccess,
  type PrivacyCommitmentProofInput,
  type PrivacyWithdrawalProofInput,
  type PrivacyProverProofRequest,
  type PrivacyProverProofResult,
  type PrivacyProverProofAction,
  type PrivacyProverFailureCode,
} from "./messages";
import { derivePrivacyPoolCommitment } from "../protocol/primitives";
import { COMMITMENT_BINDING_SELF_TEST_INPUT } from "./fixtures";

export interface PrivacyProverCoordinatorDependencies {
  readonly getUrl: (path: string) => string;
  readonly available: () => boolean;
  readonly listOffscreenDocumentUrls: () => Promise<readonly string[]>;
  readonly createOffscreenDocument: (url: string) => Promise<void>;
  readonly closeOffscreenDocument: () => Promise<void>;
  readonly sendRuntimeMessage: (message: unknown) => Promise<unknown>;
  readonly randomUuid: () => string;
  readonly onDiagnostic?: (event: PrivacyProverDiagnosticEvent) => void;
  readonly timeoutMs?: number;
}

export interface PrivacyProverDiagnosticEvent {
  readonly stage:
    | "request-started"
    | "request-failed"
    | "request-retrying"
    | "request-succeeded";
  readonly action: PrivacyProverProofAction;
  readonly attempt: 1 | 2;
  readonly code?: PrivacyProverDiagnosticCode;
}

export type PrivacyProverDiagnosticCode = PrivacyProverFailureCode
  | "unavailable"
  | "context-query-failed"
  | "offscreen-create-failed"
  | "bridge-timeout"
  | "bridge-failed"
  | "invalid-request"
  | "invalid-result"
  | "unknown";

const PRIVACY_PROVER_COORDINATOR_FAILURE_CODES = new Set<string>([
  ...PRIVACY_PROVER_FAILURE_CODES,
  "unavailable",
  "context-query-failed",
  "offscreen-create-failed",
  "bridge-timeout",
  "bridge-failed",
  "invalid-request",
  "invalid-result",
]);

export function getPrivacyProverDiagnosticCode(
  error: unknown,
): PrivacyProverDiagnosticCode {
  return error instanceof Error &&
      PRIVACY_PROVER_COORDINATOR_FAILURE_CODES.has(error.message)
    ? error.message as PrivacyProverDiagnosticCode
    : "unknown";
}

export interface PrivacyProverCoordinator {
  runFixedSelfTest(): Promise<PrivacyProverSelfTestSuccess>;
  proveCommitment(
    input: PrivacyCommitmentProofInput,
  ): Promise<Extract<PrivacyProverProofResult, { ok: true }>>;
  proveWithdrawal(
    input: PrivacyWithdrawalProofInput,
  ): Promise<Extract<PrivacyProverProofResult, { ok: true }>>;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("bridge-timeout")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      () => {
        clearTimeout(timeout);
        reject(new Error("bridge-failed"));
      },
    );
  });
}

export function createPrivacyProverCoordinator(
  dependencies: PrivacyProverCoordinatorDependencies,
): PrivacyProverCoordinator {
  const offscreenBaseUrl = dependencies.getUrl(PRIVACY_PROVER_OFFSCREEN_PATH);
  let activeSelfTest: Promise<PrivacyProverSelfTestSuccess> | undefined;
  let executionTail: Promise<void> = Promise.resolve();
  const timeoutMs = Number.isSafeInteger(dependencies.timeoutMs) &&
      dependencies.timeoutMs! > 0 &&
      dependencies.timeoutMs! <= PRIVACY_PROVER_TIMEOUT_MS
    ? dependencies.timeoutMs!
    : PRIVACY_PROVER_TIMEOUT_MS;

  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const execution = executionTail.then(work, work);
    executionTail = execution.then(() => undefined, () => undefined);
    return execution;
  };

  const closeDocument = async (): Promise<void> => {
    try {
      await dependencies.closeOffscreenDocument();
    } catch {
      // Cleanup is best effort; the next request revalidates existing contexts.
    }
  };

  const execute = async (
    requestForId: (
      id: string,
    ) => PrivacyProverSelfTestRequest | PrivacyProverProofRequest,
  ): Promise<PrivacyProverSelfTestSuccess | Extract<PrivacyProverProofResult, { ok: true }>> => {
    if (!dependencies.available()) throw new Error("unavailable");
    const existingUrls = await dependencies.listOffscreenDocumentUrls().catch(() => {
      throw new Error("context-query-failed");
    });
    if (
      existingUrls.some(
        (url) => !url.startsWith(`${offscreenBaseUrl}?nonce=`),
      )
    ) {
      throw new Error("unavailable");
    }
    if (existingUrls.length > 0) await closeDocument();

    const nonce = dependencies.randomUuid();
    const id = dependencies.randomUuid();
    if (!UUID_V4_PATTERN.test(nonce) || !UUID_V4_PATTERN.test(id)) {
      throw new Error("unavailable");
    }
    const offscreenUrl = `${PRIVACY_PROVER_OFFSCREEN_PATH}?nonce=${encodeURIComponent(nonce)}`;

    const request = requestForId(id);
    const message: PrivacyProverOffscreenRequest = {
      target: PRIVACY_PROVER_OFFSCREEN_TARGET,
      nonce,
      request,
    };

    try {
      await dependencies.createOffscreenDocument(offscreenUrl).catch(() => {
        throw new Error("offscreen-create-failed");
      });
      const rawResult = await withTimeout(
        dependencies.sendRuntimeMessage(message),
        timeoutMs,
      );
      const result = request.action === "fixed-self-test"
        ? parsePrivacyProverSelfTestResult(rawResult)
        : parsePrivacyProverProofResult(rawResult);
      if (!result || result.id !== id) throw new Error("invalid-result");
      if (
        request.action !== "fixed-self-test" &&
        "action" in result &&
        result.action !== request.action
      ) throw new Error("invalid-result");
      if (!result.ok) throw new Error(result.code);
      return result;
    } finally {
      await closeDocument();
    }
  };

  const executeProof = async (
    action: PrivacyProverProofAction,
    requestForId: (id: string) => PrivacyProverProofRequest,
  ): Promise<Extract<PrivacyProverProofResult, { ok: true }>> => {
    dependencies.onDiagnostic?.({ stage: "request-started", action, attempt: 1 });
    try {
      const result = await execute(requestForId) as Extract<PrivacyProverProofResult, { ok: true }>;
      dependencies.onDiagnostic?.({ stage: "request-succeeded", action, attempt: 1 });
      return result;
    } catch (error) {
      const code = getPrivacyProverDiagnosticCode(error);
      dependencies.onDiagnostic?.({
        stage: "request-failed",
        action,
        attempt: 1,
        code,
      });
      // Offscreen documents and their workers are intentionally disposable. A
      // single clean retry recovers transient launch/teardown failures without
      // repeating any network request or onchain effect.
      dependencies.onDiagnostic?.({
        stage: "request-retrying",
        action,
        attempt: 2,
        code,
      });
      try {
        const result = await execute(requestForId) as Extract<PrivacyProverProofResult, { ok: true }>;
        dependencies.onDiagnostic?.({ stage: "request-succeeded", action, attempt: 2 });
        return result;
      } catch (retryError) {
        dependencies.onDiagnostic?.({
          stage: "request-failed",
          action,
          attempt: 2,
          code: getPrivacyProverDiagnosticCode(retryError),
        });
        throw retryError;
      }
    }
  };

  return {
    runFixedSelfTest(): Promise<PrivacyProverSelfTestSuccess> {
      if (!activeSelfTest) {
        activeSelfTest = enqueue(() => execute((id) => ({
          version: 1,
          id,
          kind: "request",
          action: "fixed-self-test",
        })) as Promise<PrivacyProverSelfTestSuccess>).finally(() => {
            activeSelfTest = undefined;
          });
      }
      return activeSelfTest;
    },
    proveCommitment(input) {
      return enqueue(async () => {
        const result = await executeProof("prove-commitment", (id) => {
          const request = {
            version: 1 as const,
            id,
            kind: "request" as const,
            action: "prove-commitment" as const,
            input,
          };
          const parsed = parsePrivacyProverProofRequest(request);
          if (!parsed) throw new Error("invalid-request");
          return parsed;
        });
        if (!("action" in result) || result.action !== "prove-commitment") {
          throw new Error("invalid-result");
        }
        return result;
      });
    },
    proveWithdrawal(input) {
      return enqueue(async () => {
        const result = await executeProof("prove-withdrawal", (id) => {
          const request = {
            version: 1 as const,
            id,
            kind: "request" as const,
            action: "prove-withdrawal" as const,
            input,
          };
          const parsed = parsePrivacyProverProofRequest(request);
          if (!parsed) throw new Error("invalid-request");
          return parsed;
        });
        if (!("action" in result) || result.action !== "prove-withdrawal") {
          throw new Error("invalid-result");
        }
        return result;
      });
    },
  };
}

let productionCoordinator: PrivacyProverCoordinator | undefined;

function createProductionCoordinator(): PrivacyProverCoordinator {
  const runtimeWithContexts = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (filter: {
      contextTypes: string[];
    }) => Promise<Array<{ documentUrl?: string }>>;
  };
  return createPrivacyProverCoordinator({
    getUrl: (path) => chrome.runtime.getURL(path),
    available: () =>
      typeof chrome.offscreen?.createDocument === "function" &&
      typeof crypto.randomUUID === "function",
    listOffscreenDocumentUrls: async () => {
      if (runtimeWithContexts.getContexts) {
        const contexts = await runtimeWithContexts.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"],
        });
        return contexts.flatMap((context) =>
          typeof context.documentUrl === "string" ? [context.documentUrl] : [],
        );
      }
      const workerClients = (
        globalThis as typeof globalThis & {
          clients?: { matchAll(): Promise<readonly { url: string }[]> };
        }
      ).clients;
      if (!workerClients) return [];
      const clients = await workerClients.matchAll();
      const offscreenUrl = chrome.runtime.getURL(
        PRIVACY_PROVER_OFFSCREEN_PATH,
      );
      return clients
        .map((client) => client.url)
        .filter((url) => url.startsWith(offscreenUrl));
    },
    createOffscreenDocument: async (url) => {
      await chrome.offscreen.createDocument({
        url,
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Run local Privacy Pools proofs outside the wallet UI",
      });
    },
    closeOffscreenDocument: () => chrome.offscreen.closeDocument(),
    sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
    randomUuid: () => crypto.randomUUID(),
    onDiagnostic: (event) => {
      const line = JSON.stringify(event);
      if (event.stage === "request-failed") {
        console.warn("[privacy-shield] prover", line);
      } else {
        console.info("[privacy-shield] prover", line);
      }
    },
  });
}

export function runPrivacyProverFixedSelfTest(): Promise<PrivacyProverSelfTestSuccess> {
  productionCoordinator ??= createProductionCoordinator();
  return productionCoordinator.runFixedSelfTest().then(async (fixed) => {
    const requested = await productionCoordinator!.proveCommitment(
      COMMITMENT_BINDING_SELF_TEST_INPUT,
    );
    const expected = derivePrivacyPoolCommitment(
      BigInt(COMMITMENT_BINDING_SELF_TEST_INPUT.value),
      BigInt(COMMITMENT_BINDING_SELF_TEST_INPUT.label),
      {
        nullifier: BigInt(COMMITMENT_BINDING_SELF_TEST_INPUT.nullifier),
        secret: BigInt(COMMITMENT_BINDING_SELF_TEST_INPUT.secret),
      },
    );
    const expectedSignals = [
      expected.hash.toString(),
      expected.nullifierHash.toString(),
      COMMITMENT_BINDING_SELF_TEST_INPUT.value,
      COMMITMENT_BINDING_SELF_TEST_INPUT.label,
    ];
    if (
      requested.publicSignals.length !== expectedSignals.length ||
      requested.publicSignals.some((signal, index) => signal !== expectedSignals[index])
    ) {
      throw new Error("invalid-result");
    }
    return {
      ...fixed,
      commitmentMs: fixed.commitmentMs + requested.totalMs,
      totalMs: fixed.totalMs + requested.totalMs,
    };
  }).catch((error: unknown) => {
    const allowedCodes = new Set([
      "unavailable",
      "bridge-timeout",
      "bridge-failed",
      "invalid-result",
      "artifact-load-failed",
      "worker-launch-failed",
      "curve-setup-failed",
      "commitment-proof-failed",
      "commitment-verification-failed",
      "withdrawal-proof-failed",
      "withdrawal-verification-failed",
      "worker-timeout",
      "worker-runtime-failed",
      "worker-message-failed",
    ]);
    const code =
      error instanceof Error && allowedCodes.has(error.message)
        ? error.message
        : "bridge-failed";
    throw new Error(code);
  });
}

function productionProofCoordinator(): PrivacyProverCoordinator {
  productionCoordinator ??= createProductionCoordinator();
  return productionCoordinator;
}

export function provePrivacyCommitment(
  input: PrivacyCommitmentProofInput,
): Promise<Extract<PrivacyProverProofResult, { ok: true }>> {
  return productionProofCoordinator().proveCommitment(input);
}

export function provePrivacyWithdrawal(
  input: PrivacyWithdrawalProofInput,
): Promise<Extract<PrivacyProverProofResult, { ok: true }>> {
  return productionProofCoordinator().proveWithdrawal(input);
}
