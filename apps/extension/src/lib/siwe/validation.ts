import { getAddress } from "viem";
import { parseSiweMessage, getSiweFieldLine, looksLikeSiweMessage } from "./parser";
import type {
  ParsedSiweMessage,
  SiweAnalysis,
  SiweIssue,
  SiweIssueSeverity,
  SiweValidationContext,
} from "./types";

const MAX_SIWE_BYTES = 10 * 1024;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(:[0-9]+)?$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function makeIssue(
  severity: SiweIssueSeverity,
  type: SiweIssue["type"],
  field: string,
  line: number,
  message: string,
  code: string,
  suggestion?: string,
): SiweIssue {
  return { severity, type, field, line, message, code, suggestion };
}

function hostFromOrigin(origin?: string): string | undefined {
  if (!origin) return undefined;
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function domainHost(domain?: string): string | undefined {
  if (!domain) return undefined;
  const lower = domain.toLowerCase();
  const portMatch = lower.match(/^(.+):(\d+)$/);
  if (!portMatch) return lower;
  const port = Number(portMatch[2]);
  return port >= 1 && port <= 65535 ? lower : undefined;
}

function parseTimestamp(value?: string): Date | null {
  if (!value || !TIMESTAMP_RE.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasChecksumWarning(address: string): boolean {
  if (!ADDRESS_RE.test(address)) return false;
  const body = address.slice(2);
  if (!/[a-f]/.test(body) || !/[A-F]/.test(body)) return true;
  try {
    return getAddress(address) !== address;
  } catch {
    return true;
  }
}

function estimatedShannonBits(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  let bitsPerCharacter = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    bitsPerCharacter -= probability * Math.log2(probability);
  }
  return bitsPerCharacter * value.length;
}

function hasRepeatedPattern(value: string): boolean {
  const maxPatternLength = Math.min(32, Math.floor(value.length / 2));
  for (let patternLength = 1; patternLength <= maxPatternLength; patternLength += 1) {
    if (value.length % patternLength !== 0) continue;
    let repeats = true;
    for (let index = patternLength; index < value.length; index += 1) {
      if (value[index] !== value[index % patternLength]) {
        repeats = false;
        break;
      }
    }
    if (repeats) return true;
  }
  return false;
}

function isWeakNonce(nonce: string): boolean {
  return (
    estimatedShannonBits(nonce) < 32 ||
    /^(test|demo|example)/iu.test(nonce) ||
    /^(0123456789|12345678|abcdefgh)/iu.test(nonce) ||
    /(.)\1{4,}/u.test(nonce) ||
    hasRepeatedPattern(nonce)
  );
}

function validateDomainUriBinding(parsed: ParsedSiweMessage): SiweIssue[] {
  const issues: SiweIssue[] = [];
  const { domain, uri } = parsed.fields;
  if (!domain || !uri) return issues;

  try {
    const uriHost = new URL(uri).host.toLowerCase();
    const siweHost = domainHost(domain);
    if (siweHost && uriHost !== siweHost && !uriHost.endsWith(`.${siweHost}`)) {
      issues.push(
        makeIssue(
          "warning",
          "security",
          "uri",
          getSiweFieldLine(parsed.rawMessage, "uri"),
          "SIWE URI host does not match the message domain",
          "SIWE_URI_DOMAIN_MISMATCH",
          "The URI should use the same host, or a subdomain of the message domain.",
        ),
      );
    }
  } catch {
    // URI format validation reports this separately.
  }

  return issues;
}

function validateFields(parsed: ParsedSiweMessage, context: SiweValidationContext): SiweIssue[] {
  const issues: SiweIssue[] = [...parsed.parseErrors];
  const { fields } = parsed;
  const now = new Date();

  if (parsed.rawMessage.length > MAX_SIWE_BYTES) {
    issues.push(makeIssue("error", "format", "message", 1, "SIWE message is too large", "SIWE_MESSAGE_TOO_LARGE"));
  }

  const siweHost = domainHost(fields.domain);
  if (!fields.domain || !DOMAIN_RE.test(fields.domain) || !siweHost) {
    issues.push(makeIssue("error", "format", "domain", 1, "Invalid SIWE domain", "SIWE_DOMAIN_INVALID"));
  }

  if (!fields.address || !ADDRESS_RE.test(fields.address)) {
    issues.push(makeIssue("error", "format", "address", 2, "Invalid SIWE account address", "SIWE_ADDRESS_INVALID"));
  } else if (hasChecksumWarning(fields.address)) {
    issues.push(makeIssue("warning", "format", "address", 2, "Account address is not EIP-55 checksummed", "SIWE_ADDRESS_NOT_CHECKSUMMED"));
  }

  if (!fields.uri) {
    issues.push(makeIssue("error", "format", "uri", 1, "Missing SIWE URI", "SIWE_URI_MISSING"));
  } else {
    try {
      const url = new URL(fields.uri);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        issues.push(makeIssue("warning", "security", "uri", getSiweFieldLine(parsed.rawMessage, "uri"), "SIWE URI should use HTTP or HTTPS", "SIWE_URI_SCHEME_UNUSUAL"));
      } else if (url.protocol === "http:" && url.hostname !== "localhost") {
        issues.push(makeIssue("warning", "security", "uri", getSiweFieldLine(parsed.rawMessage, "uri"), "SIWE URI uses insecure HTTP", "SIWE_URI_INSECURE"));
      }
    } catch {
      issues.push(makeIssue("error", "format", "uri", getSiweFieldLine(parsed.rawMessage, "uri"), "Invalid SIWE URI", "SIWE_URI_INVALID"));
    }
  }

  if (fields.version !== "1") {
    issues.push(makeIssue("error", "compliance", "version", getSiweFieldLine(parsed.rawMessage, "version"), 'SIWE version must be "1"', "SIWE_VERSION_INVALID"));
  }

  const chainId = Number(fields.chainId);
  if (!fields.chainId || !/^[1-9]\d*$/.test(fields.chainId) || !Number.isSafeInteger(chainId)) {
    issues.push(makeIssue("error", "format", "chainId", getSiweFieldLine(parsed.rawMessage, "chainId"), "SIWE chain ID must be a positive integer", "SIWE_CHAIN_ID_INVALID"));
  } else if (context.connectedChainId && chainId !== context.connectedChainId) {
    issues.push(makeIssue("error", "security", "chainId", getSiweFieldLine(parsed.rawMessage, "chainId"), `SIWE chain ID ${chainId} does not match the connected chain ${context.connectedChainId}`, "SIWE_CHAIN_ID_MISMATCH"));
  }

  if (!fields.nonce || !/^[a-zA-Z0-9]{8,}$/.test(fields.nonce)) {
    issues.push(makeIssue("error", "format", "nonce", getSiweFieldLine(parsed.rawMessage, "nonce"), "SIWE nonce must be at least 8 alphanumeric characters", "SIWE_NONCE_INVALID"));
  } else if (fields.nonce.length < 12 || isWeakNonce(fields.nonce)) {
    issues.push(makeIssue("warning", "security", "nonce", getSiweFieldLine(parsed.rawMessage, "nonce"), "SIWE nonce appears weak", "SIWE_NONCE_WEAK"));
  }

  const issuedAt = parseTimestamp(fields.issuedAt);
  if (!issuedAt) {
    issues.push(makeIssue("error", "format", "issuedAt", getSiweFieldLine(parsed.rawMessage, "issuedAt"), "SIWE issued-at timestamp must be RFC 3339", "SIWE_ISSUED_AT_INVALID"));
  } else {
    const drift = Math.abs(now.getTime() - issuedAt.getTime());
    if (issuedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
      issues.push(makeIssue("warning", "security", "issuedAt", getSiweFieldLine(parsed.rawMessage, "issuedAt"), "SIWE message was issued in the future", "SIWE_ISSUED_AT_FUTURE"));
    } else if (drift > 60 * 60 * 1000) {
      issues.push(makeIssue("warning", "security", "issuedAt", getSiweFieldLine(parsed.rawMessage, "issuedAt"), "SIWE message is more than 1 hour old", "SIWE_ISSUED_AT_OLD"));
    }
  }

  const expiration = parseTimestamp(fields.expirationTime);
  if (!fields.expirationTime) {
    issues.push(makeIssue("warning", "security", "expirationTime", -1, "SIWE message has no expiration time", "SIWE_EXPIRATION_MISSING"));
  } else if (!expiration) {
    issues.push(makeIssue("error", "format", "expirationTime", getSiweFieldLine(parsed.rawMessage, "expirationTime"), "Invalid SIWE expiration time", "SIWE_EXPIRATION_INVALID"));
  } else {
    if (expiration <= now) {
      issues.push(makeIssue("error", "security", "expirationTime", getSiweFieldLine(parsed.rawMessage, "expirationTime"), "SIWE message has expired", "SIWE_EXPIRED"));
    }
    if (issuedAt && expiration <= issuedAt) {
      issues.push(makeIssue("error", "format", "expirationTime", getSiweFieldLine(parsed.rawMessage, "expirationTime"), "SIWE expiration must be after issued-at", "SIWE_EXPIRATION_BEFORE_ISSUED"));
    }
    if (expiration.getTime() - (issuedAt?.getTime() ?? now.getTime()) > 24 * 60 * 60 * 1000) {
      issues.push(makeIssue("warning", "security", "expirationTime", getSiweFieldLine(parsed.rawMessage, "expirationTime"), "SIWE message lifetime is longer than 24 hours", "SIWE_EXPIRATION_LONG"));
    }
  }

  const notBefore = parseTimestamp(fields.notBefore);
  if (fields.notBefore && !notBefore) {
    issues.push(makeIssue("error", "format", "notBefore", getSiweFieldLine(parsed.rawMessage, "notBefore"), "Invalid SIWE not-before time", "SIWE_NOT_BEFORE_INVALID"));
  } else if (notBefore && notBefore > now) {
    issues.push(makeIssue("error", "security", "notBefore", getSiweFieldLine(parsed.rawMessage, "notBefore"), "SIWE message is not valid yet", "SIWE_NOT_BEFORE_FUTURE"));
  }

  if (fields.statement && fields.statement.length > 200) {
    issues.push(makeIssue("warning", "format", "statement", getSiweFieldLine(parsed.rawMessage, "statement"), "SIWE statement is unusually long", "SIWE_STATEMENT_LONG"));
  }

  if (context.signerAddress && fields.address && ADDRESS_RE.test(fields.address)) {
    if (fields.address.toLowerCase() !== context.signerAddress.toLowerCase()) {
      issues.push(makeIssue("error", "security", "address", 2, "SIWE account does not match the signing account", "SIWE_SIGNER_MISMATCH"));
    }
  }

  const originHost = hostFromOrigin(context.origin);
  if (originHost && siweHost && originHost !== siweHost) {
    issues.push(makeIssue("error", "security", "domain", 1, `SIWE domain ${siweHost} does not match connected site ${originHost}`, "SIWE_ORIGIN_MISMATCH"));
  }

  issues.push(...validateDomainUriBinding(parsed));
  return dedupeIssues(issues);
}

export function analyzeSiweMessage(message: string, context: SiweValidationContext = {}): SiweAnalysis | null {
  if (!looksLikeSiweMessage(message)) return null;
  const parsed = parseSiweMessage(message);
  const issues = validateFields(parsed, context);
  const errors = issues.filter((item) => item.severity === "error");
  const warnings = issues.filter((item) => item.severity === "warning");
  const suggestions = issues.filter((item) => item.severity === "info");

  return {
    fields: parsed.fields,
    rawMessage: parsed.rawMessage,
    normalizedMessage: parsed.normalizedMessage,
    issues,
    errors,
    warnings,
    suggestions,
    isValid: errors.length === 0,
    originHost: hostFromOrigin(context.origin),
  };
}

export function decodePersonalSignMessageParam(param: unknown): string {
  if (typeof param !== "string") return "";
  if (!param.startsWith("0x")) return param;
  try {
    const bytes = new Uint8Array((param.slice(2).match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return param;
  }
}

export function validateSiwePersonalSignRequest(
  method: string,
  params: unknown[],
  context: SiweValidationContext,
): { ok: true; analysis?: SiweAnalysis } | { ok: false; error: string; analysis: SiweAnalysis } {
  if (method !== "personal_sign") return { ok: true };
  const message = decodePersonalSignMessageParam(params[0]);
  const analysis = analyzeSiweMessage(message, context);
  if (!analysis) return { ok: true };
  if (analysis.errors.length > 0) {
    return {
      ok: false,
      error: `SIWE validation failed: ${analysis.errors[0].message}`,
      analysis,
    };
  }
  return { ok: true, analysis };
}

function dedupeIssues(issues: SiweIssue[]): SiweIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.code}:${item.field}:${item.line}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
