/// <reference lib="webworker" />

import * as snarkjs from "snarkjs";

import { loadPackagedPrivacyPoolArtifact } from "../protocol/artifacts";
import {
  COMMITMENT_SELF_TEST_INPUT,
  WITHDRAWAL_SELF_TEST_INPUT,
} from "./fixtures";
import {
  parsePrivacyProverSelfTestRequest,
  parsePrivacyProverProofRequest,
  PRIVACY_PROVER_TIMEOUT_MS,
  type PrivacyGroth16Proof,
  type PrivacyProverProofRequest,
  type PrivacyProverProofResult,
  type PrivacyProverSelfTestFailure,
  type PrivacyProverSelfTestSuccess,
} from "./messages";

type Groth16ProofResult = {
  readonly proof: unknown;
  readonly publicSignals: readonly string[];
};

type SingleThreadCurve = {
  terminate?: () => Promise<void>;
};

class ProverSelfTestError extends Error {
  constructor(readonly code: PrivacyProverSelfTestFailure["code"]) {
    super(code);
    this.name = "ProverSelfTestError";
  }
}

class ProverRequestError extends Error {
  constructor(
    readonly code: Extract<PrivacyProverProofResult, { ok: false }>["code"],
  ) {
    super(code);
    this.name = "ProverRequestError";
  }
}

const workerScope = globalThis as unknown as {
  readonly location: { readonly href: string };
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
};
let running = false;

function durationSince(startedAt: number): number {
  return Math.min(
    PRIVACY_PROVER_TIMEOUT_MS,
    Math.max(0, Math.ceil(performance.now() - startedAt)),
  );
}

function parseVerificationKey(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function prove(
  input: Readonly<object>,
  wasmId: "commitment-wasm" | "withdraw-wasm",
  zkeyId: "commitment-zkey" | "withdraw-zkey",
  onArtifactsLoaded: () => void,
): Promise<Groth16ProofResult> {
  const extensionRoot = new URL("/", workerScope.location.href).href;
  const [wasm, zkey] = await Promise.all([
    loadPackagedPrivacyPoolArtifact(wasmId, extensionRoot),
    loadPackagedPrivacyPoolArtifact(zkeyId, extensionRoot),
  ]);
  onArtifactsLoaded();
  return snarkjs.groth16.fullProve(
    input as Readonly<Record<string, unknown>>,
    wasm,
    zkey,
    undefined,
    undefined,
    { singleThread: true },
  );
}

async function runFixedSelfTest(
  id: string,
): Promise<PrivacyProverSelfTestSuccess> {
  const totalStartedAt = performance.now();
  const globalCurveState = globalThis as typeof globalThis & {
    curve_bn128?: SingleThreadCurve | null;
  };
  let failureCode: PrivacyProverSelfTestFailure["code"] =
    "artifact-load-failed";
  let verificationCurve: SingleThreadCurve | undefined;

  try {
    const extensionRoot = new URL("/", workerScope.location.href).href;
    const [commitmentVkeyBytes, withdrawalVkeyBytes] = await Promise.all([
      loadPackagedPrivacyPoolArtifact("commitment-vkey", extensionRoot),
      loadPackagedPrivacyPoolArtifact("withdraw-vkey", extensionRoot),
    ]);
    const commitmentVkey = parseVerificationKey(commitmentVkeyBytes);
    const withdrawalVkey = parseVerificationKey(withdrawalVkeyBytes);

    // snarkjs 0.7.5 does not expose verifier options on groth16.verify. Its
    // pinned curve module does reuse this exact global cache, so install a
    // curve constructed in supported single-thread mode. That prevents
    // ffjavascript's default Blob-worker path, which MV3 CSP blocks.
    failureCode = "curve-setup-failed";
    if (globalCurveState.curve_bn128) {
      throw new Error("Unexpected prover curve state");
    }
    verificationCurve = (await snarkjs.curves.getCurveFromName("bn128", {
      singleThread: true,
    })) as SingleThreadCurve;
    globalCurveState.curve_bn128 = verificationCurve;

    const commitmentStartedAt = performance.now();
    const commitment = await prove(
      COMMITMENT_SELF_TEST_INPUT,
      "commitment-wasm",
      "commitment-zkey",
      () => {
        failureCode = "commitment-proof-failed";
      },
    );
    failureCode = "commitment-verification-failed";
    if (
      !(await snarkjs.groth16.verify(
        commitmentVkey,
        commitment.publicSignals,
        commitment.proof,
      ))
    ) {
      throw new Error("Commitment proof verification failed");
    }
    const commitmentMs = durationSince(commitmentStartedAt);

    failureCode = "artifact-load-failed";
    const withdrawalStartedAt = performance.now();
    const withdrawal = await prove(
      WITHDRAWAL_SELF_TEST_INPUT,
      "withdraw-wasm",
      "withdraw-zkey",
      () => {
        failureCode = "withdrawal-proof-failed";
      },
    );
    failureCode = "withdrawal-verification-failed";
    if (
      !(await snarkjs.groth16.verify(
        withdrawalVkey,
        withdrawal.publicSignals,
        withdrawal.proof,
      ))
    ) {
      throw new Error("Withdrawal proof verification failed");
    }

    return {
      version: 1,
      id,
      kind: "result",
      ok: true,
      commitmentMs,
      withdrawalMs: durationSince(withdrawalStartedAt),
      totalMs: durationSince(totalStartedAt),
    };
  } catch {
    throw new ProverSelfTestError(failureCode);
  } finally {
    globalCurveState.curve_bn128 = null;
    try {
      await verificationCurve?.terminate?.();
    } catch {
      // The worker is terminated by the offscreen host after this response.
    }
  }
}

async function runRequestedProof(
  request: PrivacyProverProofRequest,
): Promise<Extract<PrivacyProverProofResult, { ok: true }>> {
  const startedAt = performance.now();
  const globalCurveState = globalThis as typeof globalThis & {
    curve_bn128?: SingleThreadCurve | null;
  };
  let failureCode: Extract<PrivacyProverProofResult, { ok: false }>["code"] =
    "artifact-load-failed";
  let verificationCurve: SingleThreadCurve | undefined;
  try {
    const commitment = request.action === "prove-commitment";
    const extensionRoot = new URL("/", workerScope.location.href).href;
    const verificationKey = parseVerificationKey(
      await loadPackagedPrivacyPoolArtifact(
        commitment ? "commitment-vkey" : "withdraw-vkey",
        extensionRoot,
      ),
    );
    failureCode = "curve-setup-failed";
    if (globalCurveState.curve_bn128) {
      throw new Error("Unexpected prover curve state");
    }
    verificationCurve = (await snarkjs.curves.getCurveFromName("bn128", {
      singleThread: true,
    })) as SingleThreadCurve;
    globalCurveState.curve_bn128 = verificationCurve;

    failureCode = "artifact-load-failed";
    const result = await prove(
      request.input,
      commitment ? "commitment-wasm" : "withdraw-wasm",
      commitment ? "commitment-zkey" : "withdraw-zkey",
      () => {
        failureCode = commitment
          ? "commitment-proof-failed"
          : "withdrawal-proof-failed";
      },
    );
    failureCode = commitment
      ? "commitment-verification-failed"
      : "withdrawal-verification-failed";
    if (
      !(await snarkjs.groth16.verify(
        verificationKey,
        result.publicSignals,
        result.proof,
      ))
    ) {
      throw new Error("Proof verification failed");
    }
    return {
      version: 1,
      id: request.id,
      kind: "result",
      action: request.action,
      ok: true,
      proof: result.proof as PrivacyGroth16Proof,
      publicSignals: result.publicSignals,
      totalMs: durationSince(startedAt),
    };
  } catch {
    throw new ProverRequestError(failureCode);
  } finally {
    globalCurveState.curve_bn128 = null;
    try {
      await verificationCurve?.terminate?.();
    } catch {
      // The offscreen host terminates the worker after the response.
    }
  }
}

workerScope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = parsePrivacyProverSelfTestRequest(event.data) ??
    parsePrivacyProverProofRequest(event.data);
  if (!request || running) return;
  running = true;
  const operation = request.action === "fixed-self-test"
    ? runFixedSelfTest(request.id)
    : runRequestedProof(request);
  void operation
    .then((result) => workerScope.postMessage(result))
    .catch((error: unknown) => {
      const failure: PrivacyProverSelfTestFailure | PrivacyProverProofResult =
        request.action === "fixed-self-test"
          ? {
              version: 1,
              id: request.id,
              kind: "result",
              ok: false,
              code: error instanceof ProverSelfTestError
                ? error.code
                : "curve-setup-failed",
            }
          : {
              version: 1,
              id: request.id,
              kind: "result",
              action: request.action,
              ok: false,
              code: error instanceof ProverRequestError
                ? error.code
                : "curve-setup-failed",
            };
      workerScope.postMessage(failure);
    })
    .finally(() => {
      running = false;
    });
});
