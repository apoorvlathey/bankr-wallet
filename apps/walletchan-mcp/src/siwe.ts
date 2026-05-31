export interface SiweFields {
  domain: string;
  address: `0x${string}`;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  statement?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

export interface PreparedSiweMessage {
  message: string;
  fields: SiweFields;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function prepareSiweMessage(input: Record<string, unknown>): PreparedSiweMessage {
  const message = getEnvelopeMessage(input.message) || getEnvelopeMessage(input.data) || buildSiweMessage(input);
  const decoded = normalizePersonalSignMessage(message);
  const fields = parseSiweMessage(decoded);
  const requestedAddress = optionalAddress(input.address) || optionalAddress(input.walletAddress);
  if (requestedAddress && requestedAddress.toLowerCase() !== fields.address.toLowerCase()) {
    throw new Error(
      `SIWE signer mismatch: message address ${fields.address} does not match requested address ${requestedAddress}`,
    );
  }

  const requestedChainId = parseOptionalChainId(input.chain ?? input.chainId);
  if (requestedChainId && requestedChainId !== fields.chainId) {
    throw new Error(
      `SIWE chain mismatch: message chain ${fields.chainId} does not match requested chain ${requestedChainId}`,
    );
  }

  return {
    message: decoded,
    fields,
  };
}

function buildSiweMessage(input: Record<string, unknown>): string {
  const domain = requiredString(input.domain, "sign_siwe requires message or domain");
  const address = optionalAddress(input.address) || optionalAddress(input.walletAddress);
  if (!address) throw new Error("sign_siwe requires address or walletAddress");
  const uri = requiredString(input.uri, "sign_siwe requires uri");
  const version = optionalString(input.version) || "1";
  const chainId = parseOptionalChainId(input.chainId ?? input.chain);
  if (!chainId) throw new Error("sign_siwe requires chainId when message is omitted");
  const nonce = requiredString(input.nonce, "sign_siwe requires nonce");
  const issuedAt = optionalString(input.issuedAt) || new Date().toISOString();
  const statement = optionalString(input.statement);
  const expirationTime = optionalString(input.expirationTime);
  const notBefore = optionalString(input.notBefore);
  const requestId = optionalString(input.requestId);
  const resources = Array.isArray(input.resources)
    ? input.resources.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];

  const lines = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
  ];
  if (statement) {
    lines.push(statement, "");
  }
  lines.push(
    `URI: ${uri}`,
    `Version: ${version}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  );
  if (expirationTime) lines.push(`Expiration Time: ${expirationTime}`);
  if (notBefore) lines.push(`Not Before: ${notBefore}`);
  if (requestId) lines.push(`Request ID: ${requestId}`);
  if (resources.length > 0) {
    lines.push("Resources:");
    for (const resource of resources) lines.push(`- ${resource}`);
  }
  return lines.join("\n");
}

function parseSiweMessage(message: string): SiweFields {
  const lines = message.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const errors: string[] = [];
  const header = lines[0] || "";
  const headerMatch = header.match(
    /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?(.+) wants you to sign in with your Ethereum account:$/,
  );
  const domain = headerMatch?.[1]?.trim();
  if (!domain) errors.push("invalid or missing SIWE header");

  const address = lines[1]?.trim();
  if (!address || !ADDRESS_RE.test(address)) errors.push("missing or invalid SIWE address");

  const uri = getField(lines, "URI");
  const version = getField(lines, "Version");
  const chainIdRaw = getField(lines, "Chain ID");
  const nonce = getField(lines, "Nonce");
  const issuedAt = getField(lines, "Issued At");
  if (!uri) errors.push("missing SIWE URI");
  if (version !== "1") errors.push('SIWE version must be "1"');
  const chainId = Number(chainIdRaw);
  if (!chainIdRaw || !Number.isSafeInteger(chainId) || chainId <= 0) {
    errors.push("missing or invalid SIWE Chain ID");
  }
  if (!nonce || !/^[a-zA-Z0-9]{8,}$/.test(nonce)) {
    errors.push("missing or invalid SIWE nonce");
  }
  if (!issuedAt || Number.isNaN(new Date(issuedAt).getTime())) {
    errors.push("missing or invalid SIWE Issued At");
  }
  if (uri) {
    try {
      new URL(uri);
    } catch {
      errors.push("invalid SIWE URI");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid SIWE message: ${errors.join("; ")}`);
  }

  return {
    domain: domain as string,
    address: address as `0x${string}`,
    uri: uri as string,
    version: version as string,
    chainId,
    nonce: nonce as string,
    issuedAt: issuedAt as string,
    statement: parseStatement(lines),
    expirationTime: getField(lines, "Expiration Time"),
    notBefore: getField(lines, "Not Before"),
    requestId: getField(lines, "Request ID"),
    resources: parseResources(lines),
  };
}

function getField(lines: string[], field: string): string | undefined {
  const prefix = `${field}: `;
  return lines.find((line) => line.startsWith(prefix))?.slice(prefix.length);
}

function parseStatement(lines: string[]): string | undefined {
  const line = lines[3];
  if (!line || line.startsWith("URI: ")) return undefined;
  return line;
}

function parseResources(lines: string[]): string[] | undefined {
  const index = lines.findIndex((line) => line === "Resources:");
  if (index < 0) return undefined;
  const resources: string[] = [];
  for (let i = index + 1; i < lines.length; i += 1) {
    if (!lines[i].startsWith("- ")) break;
    resources.push(lines[i].slice(2));
  }
  return resources.length > 0 ? resources : undefined;
}

export function normalizePersonalSignMessage(value: string): string {
  return unwrapMessageEnvelope(decodeMaybeHex(value));
}

export function getEnvelopeMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return normalizePersonalSignMessage(value);
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    return normalizePersonalSignMessage((value as { message: string }).message);
  }
  return undefined;
}

function decodeMaybeHex(value: string): string {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) return value;
  try {
    const bytes = new Uint8Array(
      (value.slice(2).match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16)),
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

function unwrapMessageEnvelope(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return value;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { message?: unknown }).message === "string"
    ) {
      return (parsed as { message: string }).message;
    }
  } catch {
    return value;
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredString(value: unknown, message: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(message);
  return normalized;
}

function optionalAddress(value: unknown): `0x${string}` | undefined {
  if (typeof value === "string" && ADDRESS_RE.test(value)) return value as `0x${string}`;
  return undefined;
}

function parseOptionalChainId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = value.startsWith("0x") ? parseInt(value, 16) : Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}
