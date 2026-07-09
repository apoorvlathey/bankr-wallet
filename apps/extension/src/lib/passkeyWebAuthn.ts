const PASSKEY_RP_NAME = "WalletChan";
const PASSKEY_PROMPT_CANCEL_RECOVERY_MS = 800;
const PASSKEY_PROMPT_HARD_TIMEOUT_MS = 70000;

interface PrfInputs {
  eval?: {
    first: ArrayBuffer;
  };
}

interface PrfOutputs {
  enabled?: boolean;
  results?: {
    first?: ArrayBuffer;
  };
}

interface PublicKeyCredentialLike {
  rawId: ArrayBuffer;
  getClientExtensionResults(): {
    prf?: PrfOutputs;
  };
}

interface PublicKeyCredentialConstructorLike {
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
}

interface CredentialsContainerWithPublicKey {
  create(options: { publicKey: Record<string, unknown>; signal?: AbortSignal }): Promise<unknown>;
  get(options: { publicKey: Record<string, unknown>; signal?: AbortSignal }): Promise<unknown>;
}

type GlobalWithWebAuthn = typeof globalThis & {
  PublicKeyCredential?: PublicKeyCredentialConstructorLike;
};

export interface PasskeyCredentialPayload {
  credentialId: string;
  prfSalt: string;
  prfKeyMaterial: string;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  const normalized = padding === 0 ? padded : `${padded}${"=".repeat(4 - padding)}`;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getPublicKeyCredentialCtor(): PublicKeyCredentialConstructorLike | undefined {
  return (globalThis as GlobalWithWebAuthn).PublicKeyCredential;
}

function getCredentialsContainer(): CredentialsContainerWithPublicKey | null {
  if (!navigator.credentials?.create || !navigator.credentials?.get) {
    return null;
  }
  return navigator.credentials as unknown as CredentialsContainerWithPublicKey;
}

function isPublicKeyCredentialLike(value: unknown): value is PublicKeyCredentialLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "rawId" in value &&
    "getClientExtensionResults" in value &&
    typeof (value as { getClientExtensionResults?: unknown }).getClientExtensionResults === "function"
  );
}

function getPrfOutput(credential: PublicKeyCredentialLike): ArrayBuffer | null {
  return credential.getClientExtensionResults().prf?.results?.first ?? null;
}

function hasPrfEnabled(credential: PublicKeyCredentialLike): boolean {
  const results = credential.getClientExtensionResults();
  return results.prf?.enabled === true;
}

function ensureWebAuthnAvailable(): void {
  if (!getPublicKeyCredentialCtor() || !getCredentialsContainer()) {
    throw new Error("Biometric unlock is not supported in this browser");
  }
}

function makePasskeyCancelledError(message: string): Error {
  return new Error(message);
}

async function runPasskeyPrompt<T>(
  request: (signal?: AbortSignal) => Promise<T>,
  cancelledMessage: string,
): Promise<T> {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  let settled = false;
  let recoveryTimer: ReturnType<typeof window.setTimeout> | null = null;
  let hardTimeout: ReturnType<typeof window.setTimeout> | null = null;
  let rejectCancelled: ((error: Error) => void) | null = null;

  const cancelPromise = new Promise<never>((_, reject) => {
    rejectCancelled = reject;
  });

  const cleanup = () => {
    settled = true;
    if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
    if (hardTimeout !== null) window.clearTimeout(hardTimeout);
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", scheduleCancelRecovery);
      document.removeEventListener("visibilitychange", scheduleCancelRecovery);
    }
  };

  const cancel = () => {
    if (settled) return;
    settled = true;
    controller?.abort();
    rejectCancelled?.(makePasskeyCancelledError(cancelledMessage));
  };

  function scheduleCancelRecovery() {
    if (settled || typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;

    if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
    recoveryTimer = window.setTimeout(() => {
      if (
        !settled &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        (!document.hasFocus || document.hasFocus())
      ) {
        cancel();
      }
    }, PASSKEY_PROMPT_CANCEL_RECOVERY_MS);
  }

  if (typeof window !== "undefined") {
    window.addEventListener("focus", scheduleCancelRecovery);
    document.addEventListener("visibilitychange", scheduleCancelRecovery);
    hardTimeout = window.setTimeout(cancel, PASSKEY_PROMPT_HARD_TIMEOUT_MS);
  }

  const requestPromise = request(controller?.signal);
  requestPromise.catch(() => undefined);

  try {
    return await Promise.race([requestPromise, cancelPromise]);
  } finally {
    cleanup();
  }
}

export async function isPasskeyUnlockSupported(): Promise<boolean> {
  if (typeof navigator !== "undefined" && /Firefox/i.test(navigator.userAgent)) {
    return false;
  }
  const publicKeyCredential = getPublicKeyCredentialCtor();
  if (!publicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable || !getCredentialsContainer()) {
    return false;
  }

  try {
    return await publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function createPasskeyUnlockCredential(): Promise<PasskeyCredentialPayload> {
  ensureWebAuthnAvailable();

  const supported = await isPasskeyUnlockSupported();
  if (!supported) {
    throw new Error("Biometric unlock is not supported on this device");
  }

  const userId = randomBytes(16);
  const prfSaltBytes = randomBytes(32);
  const credentials = getCredentialsContainer();
  if (!credentials) {
    throw new Error("Biometric unlock is not supported in this browser");
  }

  const publicKey: Record<string, unknown> & {
    extensions?: { prf?: PrfInputs };
  } = {
    challenge: randomBytes(32),
    rp: {
      name: PASSKEY_RP_NAME,
    },
    user: {
      id: userId,
      name: PASSKEY_RP_NAME,
      displayName: PASSKEY_RP_NAME,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
    timeout: 60000,
    attestation: "none",
    extensions: {
      prf: {
        eval: {
          first: prfSaltBytes.buffer as ArrayBuffer,
        },
      },
    },
  };

  const created = await runPasskeyPrompt(
    (signal) => credentials.create({ publicKey, signal }),
    "Passkey setup was cancelled",
  );
  if (!isPublicKeyCredentialLike(created)) {
    throw new Error("Passkey setup was cancelled");
  }

  if (!hasPrfEnabled(created)) {
    throw new Error("This passkey does not support biometric unlock");
  }

  const credentialId = base64UrlEncode(new Uint8Array(created.rawId));
  const prfSalt = base64UrlEncode(prfSaltBytes);
  // Some authenticators can evaluate the PRF during credential creation. In
  // that case the user-verifying creation ceremony already produced the key
  // material we need, so avoid immediately prompting for a second assertion.
  // Authenticators that only advertise PRF support during creation still need
  // the assertion fallback to obtain their first PRF output.
  const creationPrfOutput = getPrfOutput(created);
  const prfKeyMaterial = creationPrfOutput
    ? base64UrlEncode(new Uint8Array(creationPrfOutput))
    : await getPasskeyUnlockPrfOutput(credentialId, prfSalt);

  return {
    credentialId,
    prfSalt,
    prfKeyMaterial,
  };
}

export async function getPasskeyUnlockPrfOutput(
  credentialId: string,
  prfSalt: string,
): Promise<string> {
  ensureWebAuthnAvailable();

  const saltBytes = base64UrlDecode(prfSalt);
  const credentials = getCredentialsContainer();
  if (!credentials) {
    throw new Error("Biometric unlock is not supported in this browser");
  }

  const publicKey: Record<string, unknown> & {
    extensions?: { prf?: PrfInputs };
  } = {
    challenge: randomBytes(32),
    allowCredentials: [
      {
        id: base64UrlDecode(credentialId),
        type: "public-key",
        transports: ["internal"],
      },
    ],
    userVerification: "required",
    timeout: 60000,
    extensions: {
      prf: {
        eval: {
          first: saltBytes.buffer as ArrayBuffer,
        },
      },
    },
  };

  const assertion = await runPasskeyPrompt(
    (signal) => credentials.get({ publicKey, signal }),
    "Biometric unlock was cancelled",
  );
  if (!isPublicKeyCredentialLike(assertion)) {
    throw new Error("Biometric unlock was cancelled");
  }

  const prfOutput = getPrfOutput(assertion);
  if (!prfOutput) {
    throw new Error("This passkey cannot unlock WalletChan");
  }

  return base64UrlEncode(new Uint8Array(prfOutput));
}

export function getPasskeyErrorMessage(error: unknown): string {
  if (isPasskeyPromptCancelled(error)) {
    return "Biometric prompt cancelled";
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Biometric prompt cancelled";
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Biometric prompt cancelled";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Biometric unlock failed";
}

export function isPasskeyPromptCancelled(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "NotAllowedError" || error.name === "AbortError";
  }
  if (error instanceof Error) {
    return /cancelled|canceled|abort/i.test(error.message);
  }
  return false;
}
