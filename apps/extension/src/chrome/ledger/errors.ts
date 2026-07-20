/** Stable user-facing error vocabulary for Ledger device operations. */
export enum LedgerErrorCode {
  DEVICE_LOCKED = "DEVICE_LOCKED",
  WRONG_APP = "WRONG_APP",
  USER_REJECTED = "USER_REJECTED",
  DEVICE_DISCONNECTED = "DEVICE_DISCONNECTED",
  BLIND_SIGN_DISABLED = "BLIND_SIGN_DISABLED",
  WEBHID_UNSUPPORTED = "WEBHID_UNSUPPORTED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  TRANSPORT_BUSY = "TRANSPORT_BUSY",
  FIRMWARE_TOO_OLD = "FIRMWARE_TOO_OLD",
  APP_TOO_OLD = "APP_TOO_OLD",
  OFFSCREEN_UNAVAILABLE = "OFFSCREEN_UNAVAILABLE",
  MALFORMED_TYPED_DATA = "MALFORMED_TYPED_DATA",
  NOT_ENABLED = "NOT_ENABLED",
  UNKNOWN = "UNKNOWN",
}

export class LedgerError extends Error {
  constructor(
    readonly code: LedgerErrorCode,
    readonly userMessage: string,
    readonly technicalMessage = userMessage,
  ) {
    super(userMessage);
    this.name = "LedgerError";
  }
}

const STATUS_MESSAGES: Record<number, [LedgerErrorCode, string]> = {
  0x6985: [LedgerErrorCode.USER_REJECTED, "Rejected on your Ledger."],
  0x5501: [LedgerErrorCode.USER_REJECTED, "Rejected on your Ledger."],
  0x6a80: [
    LedgerErrorCode.BLIND_SIGN_DISABLED,
    "Enable blind signing in the Ethereum app settings on your Ledger.",
  ],
  0x6d00: [LedgerErrorCode.APP_TOO_OLD, "Update the Ethereum app in Ledger Wallet."],
  0x6e00: [LedgerErrorCode.FIRMWARE_TOO_OLD, "Update your Ledger firmware."],
  0x5515: [LedgerErrorCode.DEVICE_LOCKED, "Unlock your Ledger and open the Ethereum app."],
};

export function normalizeLedgerError(error: unknown): LedgerError {
  if (error instanceof LedgerError) return error;
  const technical = technicalMessage(error);
  const code = statusCode(error);
  if (code !== null && STATUS_MESSAGES[code]) {
    const [ledgerCode, userMessage] = STATUS_MESSAGES[code];
    return new LedgerError(ledgerCode, userMessage, technical);
  }
  const lower = technical.toLowerCase();
  if (lower.includes("user gesture") || lower.includes("permission denied")) {
    return new LedgerError(
      LedgerErrorCode.PERMISSION_DENIED,
      "Connect your Ledger and grant device access when prompted.",
      technical,
    );
  }
  if (lower.includes("hid") && lower.includes("support")) {
    return new LedgerError(
      LedgerErrorCode.WEBHID_UNSUPPORTED,
      "Ledger support requires Chrome 124 or newer.",
      technical,
    );
  }
  if (lower.includes("busy") || lower.includes("in use")) {
    return new LedgerError(
      LedgerErrorCode.TRANSPORT_BUSY,
      "Close Ledger Wallet or another wallet using the device, then try again.",
      technical,
    );
  }
  if (lower.includes("disconnect") || lower.includes("device not found")) {
    return new LedgerError(
      LedgerErrorCode.DEVICE_DISCONNECTED,
      "Reconnect your Ledger and try again.",
      technical,
    );
  }
  return new LedgerError(
    LedgerErrorCode.UNKNOWN,
    "Something went wrong while talking to your Ledger. Try again.",
    technical,
  );
}

function technicalMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = error as Record<string, unknown>;
  for (const key of ["statusCode", "status", "code"]) {
    if (typeof value[key] === "number") return value[key];
  }
  for (const key of ["cause", "originalError", "error"]) {
    const nested = statusCode(value[key]);
    if (nested !== null) return nested;
  }
  const match = technicalMessage(error).match(/0x([0-9a-f]{4})/i);
  return match ? Number.parseInt(match[1], 16) : null;
}
