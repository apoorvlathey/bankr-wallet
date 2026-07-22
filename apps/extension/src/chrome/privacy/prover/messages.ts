export const PRIVACY_PROVER_OFFSCREEN_PATH = "privacy-prover-offscreen.html";
export const PRIVACY_PROVER_OFFSCREEN_TARGET =
  "walletchan-privacy-prover-offscreen-v1";
export const PRIVACY_PROVER_TIMEOUT_MS = 120_000;

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface PrivacyProverSelfTestRequest {
  readonly version: 1;
  readonly id: string;
  readonly kind: "request";
  readonly action: "fixed-self-test";
}

export interface PrivacyCommitmentProofInput {
  readonly value: string;
  readonly label: string;
  readonly nullifier: string;
  readonly secret: string;
}

export interface PrivacyWithdrawalProofInput {
  readonly withdrawnValue: string;
  readonly stateRoot: string;
  readonly stateTreeDepth: "32";
  readonly ASPRoot: string;
  readonly ASPTreeDepth: "32";
  readonly context: string;
  readonly label: string;
  readonly existingValue: string;
  readonly existingNullifier: string;
  readonly existingSecret: string;
  readonly newNullifier: string;
  readonly newSecret: string;
  readonly stateSiblings: readonly string[];
  readonly stateIndex: string;
  readonly ASPSiblings: readonly string[];
  readonly ASPIndex: string;
}

export type PrivacyProverProofAction = "prove-commitment" | "prove-withdrawal";

export type PrivacyProverProofRequest =
  | {
      readonly version: 1;
      readonly id: string;
      readonly kind: "request";
      readonly action: "prove-commitment";
      readonly input: PrivacyCommitmentProofInput;
    }
  | {
      readonly version: 1;
      readonly id: string;
      readonly kind: "request";
      readonly action: "prove-withdrawal";
      readonly input: PrivacyWithdrawalProofInput;
    };

export interface PrivacyGroth16Proof {
  readonly pi_a: readonly [string, string, string];
  readonly pi_b: readonly [
    readonly [string, string],
    readonly [string, string],
    readonly [string, string],
  ];
  readonly pi_c: readonly [string, string, string];
  readonly protocol: "groth16";
  readonly curve: "bn128";
}

export const PRIVACY_PROVER_FAILURE_CODES = Object.freeze([
  "artifact-load-failed",
  "worker-launch-failed",
  "worker-timeout",
  "worker-runtime-failed",
  "worker-message-failed",
  "curve-setup-failed",
  "commitment-proof-failed",
  "commitment-verification-failed",
  "withdrawal-proof-failed",
  "withdrawal-verification-failed",
] as const);

export type PrivacyProverFailureCode =
  typeof PRIVACY_PROVER_FAILURE_CODES[number];

export type PrivacyProverProofResult =
  | {
      readonly version: 1;
      readonly id: string;
      readonly kind: "result";
      readonly action: PrivacyProverProofAction;
      readonly ok: true;
      readonly proof: PrivacyGroth16Proof;
      readonly publicSignals: readonly string[];
      readonly totalMs: number;
    }
  | {
      readonly version: 1;
      readonly id: string;
      readonly kind: "result";
      readonly action: PrivacyProverProofAction;
      readonly ok: false;
      readonly code: PrivacyProverFailureCode;
    };

export interface PrivacyProverSelfTestSuccess {
  readonly version: 1;
  readonly id: string;
  readonly kind: "result";
  readonly ok: true;
  readonly commitmentMs: number;
  readonly withdrawalMs: number;
  readonly totalMs: number;
}

export interface PrivacyProverSelfTestFailure {
  readonly version: 1;
  readonly id: string;
  readonly kind: "result";
  readonly ok: false;
  readonly code: PrivacyProverFailureCode;
}

export type PrivacyProverSelfTestResult =
  | PrivacyProverSelfTestSuccess
  | PrivacyProverSelfTestFailure;

export interface PrivacyProverOffscreenRequest {
  readonly target: typeof PRIVACY_PROVER_OFFSCREEN_TARGET;
  readonly nonce: string;
  readonly request: PrivacyProverSelfTestRequest | PrivacyProverProofRequest;
}

export function isPrivacyProverBackgroundSender(
  sender: { readonly id?: string; readonly url?: string; readonly tab?: unknown },
  runtimeId: string,
  backgroundUrl: string,
): boolean {
  return (
    sender.id === runtimeId &&
    sender.url === backgroundUrl &&
    sender.tab === undefined
  );
}

function isExactObject(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

function isDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= PRIVACY_PROVER_TIMEOUT_MS
  );
}

const UINT = /^(?:0|[1-9]\d{0,79})$/;

function isUint(value: unknown, nonZero = false): value is string {
  if (typeof value !== "string" || !UINT.test(value)) return false;
  try {
    return !nonZero || BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function parseCommitmentInput(value: unknown): PrivacyCommitmentProofInput | null {
  if (!isExactObject(value, ["label", "nullifier", "secret", "value"])) return null;
  const input = value as Record<string, unknown>;
  return isUint(input.value, true) &&
      isUint(input.label, true) &&
      isUint(input.nullifier, true) &&
      isUint(input.secret, true)
    ? {
        value: input.value,
        label: input.label,
        nullifier: input.nullifier,
        secret: input.secret,
      }
    : null;
}

function parseSiblings(value: unknown): readonly string[] | null {
  return Array.isArray(value) &&
      value.length === 32 &&
      value.every((sibling) => isUint(sibling))
    ? Object.freeze([...value] as string[])
    : null;
}

function parseWithdrawalInput(value: unknown): PrivacyWithdrawalProofInput | null {
  if (!isExactObject(value, [
    "ASPRoot",
    "ASPSiblings",
    "ASPIndex",
    "ASPTreeDepth",
    "context",
    "existingNullifier",
    "existingSecret",
    "existingValue",
    "label",
    "newNullifier",
    "newSecret",
    "stateIndex",
    "stateRoot",
    "stateSiblings",
    "stateTreeDepth",
    "withdrawnValue",
  ])) return null;
  const input = value as Record<string, unknown>;
  const stateSiblings = parseSiblings(input.stateSiblings);
  const aspSiblings = parseSiblings(input.ASPSiblings);
  if (
    !stateSiblings ||
    !aspSiblings ||
    input.stateTreeDepth !== "32" ||
    input.ASPTreeDepth !== "32" ||
    !isUint(input.withdrawnValue, true) ||
    !isUint(input.stateRoot, true) ||
    !isUint(input.ASPRoot, true) ||
    !isUint(input.context, true) ||
    !isUint(input.label, true) ||
    !isUint(input.existingValue, true) ||
    BigInt(input.withdrawnValue) > BigInt(input.existingValue) ||
    !isUint(input.existingNullifier, true) ||
    !isUint(input.existingSecret, true) ||
    !isUint(input.newNullifier, true) ||
    !isUint(input.newSecret, true) ||
    !isUint(input.stateIndex) || BigInt(input.stateIndex) > 0xffff_ffffn ||
    !isUint(input.ASPIndex) || BigInt(input.ASPIndex) > 0xffff_ffffn
  ) return null;
  return {
    withdrawnValue: input.withdrawnValue,
    stateRoot: input.stateRoot,
    stateTreeDepth: "32",
    ASPRoot: input.ASPRoot,
    ASPTreeDepth: "32",
    context: input.context,
    label: input.label,
    existingValue: input.existingValue,
    existingNullifier: input.existingNullifier,
    existingSecret: input.existingSecret,
    newNullifier: input.newNullifier,
    newSecret: input.newSecret,
    stateSiblings,
    stateIndex: input.stateIndex,
    ASPSiblings: aspSiblings,
    ASPIndex: input.ASPIndex,
  };
}

export function parsePrivacyProverProofRequest(
  value: unknown,
): PrivacyProverProofRequest | null {
  if (!isExactObject(value, ["action", "id", "input", "kind", "version"])) {
    return null;
  }
  const request = value as Record<string, unknown>;
  if (
    request.version !== 1 ||
    !isRequestId(request.id) ||
    request.kind !== "request"
  ) return null;
  if (request.action === "prove-commitment") {
    const input = parseCommitmentInput(request.input);
    return input ? { version: 1, id: request.id, kind: "request", action: request.action, input } : null;
  }
  if (request.action === "prove-withdrawal") {
    const input = parseWithdrawalInput(request.input);
    return input ? { version: 1, id: request.id, kind: "request", action: request.action, input } : null;
  }
  return null;
}

export function parsePrivacyProverSelfTestRequest(
  value: unknown,
): PrivacyProverSelfTestRequest | null {
  if (!isExactObject(value, ["version", "id", "kind", "action"])) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    !isRequestId(candidate.id) ||
    candidate.kind !== "request" ||
    candidate.action !== "fixed-self-test"
  ) {
    return null;
  }
  return {
    version: 1,
    id: candidate.id,
    kind: "request",
    action: "fixed-self-test",
  };
}

export function parsePrivacyProverOffscreenRequest(
  value: unknown,
  expectedNonce: string,
): PrivacyProverOffscreenRequest | null {
  if (!isExactObject(value, ["target", "nonce", "request"])) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.target !== PRIVACY_PROVER_OFFSCREEN_TARGET ||
    candidate.nonce !== expectedNonce ||
    !isRequestId(candidate.nonce)
  ) {
    return null;
  }
  const request = parsePrivacyProverSelfTestRequest(candidate.request) ??
    parsePrivacyProverProofRequest(candidate.request);
  if (!request) return null;
  return {
    target: PRIVACY_PROVER_OFFSCREEN_TARGET,
    nonce: candidate.nonce,
    request,
  };
}


function parseTuple(value: unknown, length: number): readonly string[] | null {
  return Array.isArray(value) && value.length === length && value.every((item) => isUint(item))
    ? value as string[]
    : null;
}

function parseProof(value: unknown): PrivacyGroth16Proof | null {
  if (!isExactObject(value, ["curve", "pi_a", "pi_b", "pi_c", "protocol"])) return null;
  const proof = value as Record<string, unknown>;
  const piA = parseTuple(proof.pi_a, 3);
  const piC = parseTuple(proof.pi_c, 3);
  if (!Array.isArray(proof.pi_b) || proof.pi_b.length !== 3) return null;
  const piB = proof.pi_b.map((item) => parseTuple(item, 2));
  if (
    !piA || !piC || piB.some((item) => item === null) ||
    proof.protocol !== "groth16" || proof.curve !== "bn128"
  ) return null;
  return {
    pi_a: piA as unknown as PrivacyGroth16Proof["pi_a"],
    pi_b: piB as unknown as PrivacyGroth16Proof["pi_b"],
    pi_c: piC as unknown as PrivacyGroth16Proof["pi_c"],
    protocol: "groth16",
    curve: "bn128",
  };
}

export function parsePrivacyProverProofResult(
  value: unknown,
): PrivacyProverProofResult | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (
    result.version !== 1 || !isRequestId(result.id) || result.kind !== "result" ||
    (result.action !== "prove-commitment" && result.action !== "prove-withdrawal") ||
    typeof result.ok !== "boolean"
  ) return null;
  if (!result.ok) {
    if (
      !isExactObject(value, ["action", "code", "id", "kind", "ok", "version"]) ||
      !PRIVACY_PROVER_FAILURE_CODES.includes(
        result.code as PrivacyProverFailureCode,
      )
    ) return null;
    return result as PrivacyProverProofResult;
  }
  if (!isExactObject(value, [
    "action", "id", "kind", "ok", "proof", "publicSignals", "totalMs", "version",
  ])) return null;
  const proof = parseProof(result.proof);
  const expectedSignals = result.action === "prove-commitment" ? 4 : 8;
  if (
    !proof || !Array.isArray(result.publicSignals) ||
    result.publicSignals.length !== expectedSignals ||
    !result.publicSignals.every((signal) => isUint(signal)) ||
    !isDuration(result.totalMs)
  ) return null;
  return {
    version: 1,
    id: result.id,
    kind: "result",
    action: result.action,
    ok: true,
    proof,
    publicSignals: result.publicSignals as string[],
    totalMs: result.totalMs,
  };
}

export function parsePrivacyProverSelfTestResult(
  value: unknown,
): PrivacyProverSelfTestResult | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    !isRequestId(candidate.id) ||
    candidate.kind !== "result" ||
    typeof candidate.ok !== "boolean"
  ) {
    return null;
  }
  if (candidate.ok) {
    if (
      !isExactObject(value, [
        "version",
        "id",
        "kind",
        "ok",
        "commitmentMs",
        "withdrawalMs",
        "totalMs",
      ]) ||
      !isDuration(candidate.commitmentMs) ||
      !isDuration(candidate.withdrawalMs) ||
      !isDuration(candidate.totalMs) ||
      candidate.totalMs < candidate.commitmentMs ||
      candidate.totalMs < candidate.withdrawalMs
    ) {
      return null;
    }
    return {
      version: 1,
      id: candidate.id,
      kind: "result",
      ok: true,
      commitmentMs: candidate.commitmentMs,
      withdrawalMs: candidate.withdrawalMs,
      totalMs: candidate.totalMs,
    };
  }
  if (
    !isExactObject(value, ["version", "id", "kind", "ok", "code"]) ||
    !PRIVACY_PROVER_FAILURE_CODES.includes(
      candidate.code as PrivacyProverFailureCode,
    )
  ) {
    return null;
  }
  return {
    version: 1,
    id: candidate.id,
    kind: "result",
    ok: false,
    code: candidate.code as PrivacyProverSelfTestFailure["code"],
  };
}
