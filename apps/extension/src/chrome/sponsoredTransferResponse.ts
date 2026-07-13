export interface PremiumStatusResponse {
  isPremium: boolean;
  balance: string;
  sponsoredTransfersEnabled: boolean;
}

function parseObject(text: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} returned an invalid response`);
  }
  return parsed as Record<string, unknown>;
}

function safeError(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const sanitized = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 1_000);
  return sanitized || fallback;
}

export function parsePremiumStatusResponse(
  text: string,
): PremiumStatusResponse {
  const data = parseObject(text, "Premium status");
  if (
    typeof data.isPremium !== "boolean" ||
    typeof data.balance !== "string" ||
    data.balance.length > 128 ||
    !/^[0-9]+(?:\.[0-9]+)?$/.test(data.balance) ||
    (data.sponsoredTransfersEnabled !== undefined &&
      typeof data.sponsoredTransfersEnabled !== "boolean")
  ) {
    throw new Error("Premium status returned an invalid response");
  }
  return {
    isPremium: data.isPremium,
    balance: data.balance,
    sponsoredTransfersEnabled:
      typeof data.sponsoredTransfersEnabled === "boolean"
        ? data.sponsoredTransfersEnabled
        : true,
  };
}

export function parseSponsoredTransferResponse(
  text: string,
  responseOk: boolean,
): `0x${string}` {
  const data = parseObject(text, "Sponsored transfer");
  if (!responseOk) {
    throw new Error(safeError(data.error, "Sponsored transfer failed"));
  }
  if (typeof data.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(data.txHash)) {
    throw new Error(
      safeError(
        data.error,
        "Sponsored transfer returned an invalid transaction hash",
      ),
    );
  }
  return data.txHash as `0x${string}`;
}
