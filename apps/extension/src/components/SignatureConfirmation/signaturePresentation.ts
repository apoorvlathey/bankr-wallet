export interface FormattedSignatureData {
  message: string;
  rawData: string;
  typedData?: Record<string, any>;
}

export function getMethodDisplayName(method: string): string {
  switch (method) {
    case "personal_sign":
      return "Personal message";
    case "eth_sign":
      return "Data hash";
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
  params: any[],
): FormattedSignatureData {
  try {
    if (method === "personal_sign") {
      const messageParam = params[0];
      let message = messageParam;

      if (typeof messageParam === "string" && messageParam.startsWith("0x")) {
        try {
          const hex = messageParam.slice(2);
          const bytes = new Uint8Array(
            hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [],
          );
          message = new TextDecoder().decode(bytes);
        } catch {
          message = messageParam;
        }
      }

      return {
        message,
        rawData: JSON.stringify(params, null, 2),
      };
    }

    if (method === "eth_sign") {
      return {
        message: params[1] || "",
        rawData: JSON.stringify(params, null, 2),
      };
    }

    if (method.startsWith("eth_signTypedData")) {
      const typedData =
        typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];

      return {
        message: typedData.message
          ? JSON.stringify(typedData.message, null, 2)
          : "",
        rawData: JSON.stringify(typedData, null, 2),
        typedData,
      };
    }
  } catch {
    // Preserve the original request as raw JSON when decoding is not possible.
  }

  return {
    message: "",
    rawData: JSON.stringify(params, null, 2),
  };
}

export function getSignatureIntent({
  method,
  originHostname,
  typedData,
  isSiwe,
  isDelegation,
}: {
  method: string;
  originHostname: string;
  typedData?: Record<string, any>;
  isSiwe: boolean;
  isDelegation: boolean;
}): { title: string; description: string } {
  if (isSiwe) {
    return {
      title: `Sign in to ${originHostname}`,
      description:
        "Confirm the site, account, and network before signing this login request.",
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
    const application = typedData.domain?.name || originHostname;
    return {
      title: `Authorize ${application}`,
      description:
        "This structured signature may authorize actions without sending a transaction.",
    };
  }

  if (method === "eth_sign") {
    return {
      title: "Sign a data hash",
      description:
        "The original message is not readable here. Only sign if you trust this request.",
    };
  }

  return {
    title: "Sign a message",
    description:
      "This creates a cryptographic signature for the requesting site. It does not send a transaction.",
  };
}
