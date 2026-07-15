export interface FormattedSignatureData {
  message: string;
  messageReadable: boolean;
  rawPayload: string;
  rawData: string;
  typedData?: Record<string, unknown>;
}

export interface ClearSigningTypedData {
  primaryType: string;
  domain?: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isClearSigningTypedData(
  value: unknown,
): value is ClearSigningTypedData {
  if (!isRecord(value)) return false;
  if (typeof value.primaryType !== "string") return false;
  if (!isRecord(value.types) || !isRecord(value.message)) return false;
  if (value.domain !== undefined && !isRecord(value.domain)) return false;

  return Object.values(value.types).every(
    (fields) =>
      Array.isArray(fields) &&
      fields.every(
        (field) =>
          isRecord(field) &&
          typeof field.name === "string" &&
          typeof field.type === "string",
      ),
  );
}

export function getOriginHostname(origin: string, fallback: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    try {
      return new URL(fallback).hostname;
    } catch {
      return origin;
    }
  }
}

function stringifySignatureValue(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, nestedValue) =>
        typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
      2,
    );
  } catch {
    return String(value ?? "");
  }
}

function isReadableText(value: string): boolean {
  if (value.includes("\uFFFD")) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isDisallowedControl =
      (codePoint >= 0 && codePoint <= 8) ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      codePoint === 127;
    if (isDisallowedControl) return false;
  }
  return true;
}

export function decodePersonalMessage(value: unknown): {
  message: string;
  readable: boolean;
} {
  if (typeof value !== "string") {
    return { message: "", readable: false };
  }

  if (!value.startsWith("0x")) {
    return { message: value, readable: isReadableText(value) };
  }

  const hex = value.slice(2);
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/iu.test(hex)) {
    return { message: "", readable: false };
  }

  try {
    const bytes = new Uint8Array(
      hex.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
    );
    const message = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { message, readable: isReadableText(message) };
  } catch {
    return { message: "", readable: false };
  }
}

export function getMethodDisplayName(method: string): string {
  switch (method) {
    case "personal_sign":
      return "Personal message";
    case "eth_sign":
      return "Raw data hash";
    case "eth_signTypedData":
      return "Typed data";
    case "eth_signTypedData_v3":
      return "Typed data v3";
    case "eth_signTypedData_v4":
      return "Typed data v4";
    default:
      return method;
  }
}

export function getSignerAddress(
  method: string,
  params: unknown[],
): string | null {
  if (method === "personal_sign" && params[1]) return String(params[1]);
  if (method === "eth_sign" && params[0]) return String(params[0]);
  if (method.startsWith("eth_signTypedData") && params[0]) {
    return String(params[0]);
  }
  return null;
}

export function formatSignatureData(
  method: string,
  params: unknown[],
): FormattedSignatureData {
  const rawData = stringifySignatureValue(params);

  try {
    if (method === "personal_sign") {
      const rawPayload =
        typeof params[0] === "string"
          ? params[0]
          : stringifySignatureValue(params[0]);
      const decoded = decodePersonalMessage(params[0]);
      return {
        message: decoded.message,
        messageReadable: decoded.readable,
        rawPayload,
        rawData,
      };
    }

    if (method === "eth_sign") {
      return {
        message: "",
        messageReadable: false,
        rawPayload:
          typeof params[1] === "string"
            ? params[1]
            : stringifySignatureValue(params[1]),
        rawData,
      };
    }

    if (method.startsWith("eth_signTypedData")) {
      const typedDataValue =
        typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
      const typedData =
        typeof typedDataValue === "object" &&
        typedDataValue !== null &&
        !Array.isArray(typedDataValue)
          ? (typedDataValue as Record<string, unknown>)
          : undefined;

      return {
        message: typedData?.message
          ? stringifySignatureValue(typedData.message)
          : "",
        messageReadable: Boolean(typedData?.message),
        rawPayload: stringifySignatureValue(typedDataValue),
        rawData,
        typedData,
      };
    }
  } catch {
    // Keep the original bounded request available in Advanced details.
  }

  return {
    message: "",
    messageReadable: false,
    rawPayload: typeof params[0] === "string" ? params[0] : "",
    rawData,
  };
}

export function getSignatureIntent({
  method,
  originHostname,
  typedData,
  isSiwe,
  isDelegation,
  messageReadable,
}: {
  method: string;
  originHostname: string;
  typedData?: Record<string, unknown>;
  isSiwe: boolean;
  isDelegation: boolean;
  messageReadable: boolean;
}): { title: string; description: string } {
  if (isSiwe) {
    return {
      title: `Sign in to ${originHostname}`,
      description:
        "This proves control of your wallet without sending a transaction.",
    };
  }

  if (isDelegation) {
    return {
      title: "Authorize account permissions",
      description:
        "This signature can grant reusable permissions. Review every permission before signing.",
    };
  }

  if (typedData) {
    const domain = typedData.domain;
    const application =
      typeof domain === "object" &&
      domain !== null &&
      !Array.isArray(domain) &&
      typeof (domain as Record<string, unknown>).name === "string"
        ? String((domain as Record<string, unknown>).name)
        : originHostname;
    return {
      title: `Authorize ${application}`,
      description:
        "Review the structured fields below before authorizing this request.",
    };
  }

  if (method === "eth_sign" || !messageReadable) {
    return {
      title: "Sign unreadable data",
      description:
        "WalletChan cannot verify the meaning of this payload. Only sign if you trust the request.",
    };
  }

  return {
    title: "Sign this message",
    description:
      "Signing proves this wallet approved the message shown below.",
  };
}
