import type { ParsedSiweMessage, SiweIssue, SiweMessageFields } from "./types";

const REQUIRED_FIELDS: Array<keyof SiweMessageFields> = [
  "domain",
  "address",
  "uri",
  "version",
  "chainId",
  "nonce",
  "issuedAt",
];

const FIELD_PREFIXES: Array<{ prefix: string; field: keyof SiweMessageFields }> = [
  { prefix: "URI: ", field: "uri" },
  { prefix: "Version: ", field: "version" },
  { prefix: "Chain ID: ", field: "chainId" },
  { prefix: "Nonce: ", field: "nonce" },
  { prefix: "Issued At: ", field: "issuedAt" },
];

const OPTIONAL_PREFIXES: Array<{ prefix: string; field: keyof SiweMessageFields }> = [
  { prefix: "Expiration Time: ", field: "expirationTime" },
  { prefix: "Not Before: ", field: "notBefore" },
  { prefix: "Request ID: ", field: "requestId" },
];

function issue(field: string, line: number, message: string, code: string): SiweIssue {
  return {
    type: "format",
    field,
    line,
    message,
    severity: "error",
    code,
  };
}

export function normalizeSiweLineEndings(message: string): string {
  return message.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function looksLikeSiweMessage(message: string): boolean {
  const firstLine = normalizeSiweLineEndings(message).split("\n")[0] || "";
  return firstLine.includes("wants you to sign in with your Ethereum account:");
}

export function parseSiweMessage(message: string): ParsedSiweMessage {
  const normalizedMessage = normalizeSiweLineEndings(message);
  const lines = normalizedMessage.split("\n");
  const fields: SiweMessageFields = {};
  const parseErrors: SiweIssue[] = [];
  let lineIndex = 0;

  const header = lines[lineIndex] || "";
  const headerMatch = header.match(
    /^(?:([a-zA-Z][a-zA-Z0-9+.-]*):\/\/)?(.+) wants you to sign in with your Ethereum account:$/,
  );
  if (headerMatch) {
    if (headerMatch[1]) fields.scheme = headerMatch[1];
    fields.domain = headerMatch[2];
  } else {
    parseErrors.push(
      issue(
        "header",
        1,
        'Invalid SIWE header. Expected "[scheme://]domain wants you to sign in with your Ethereum account:"',
        "INVALID_HEADER",
      ),
    );
  }
  lineIndex += 1;

  if (lines[lineIndex]?.trim()) {
    fields.address = lines[lineIndex].trim();
    lineIndex += 1;
  } else {
    parseErrors.push(issue("address", lineIndex + 1, "Missing Ethereum address", "MISSING_ADDRESS"));
  }

  if (lines[lineIndex] === "") lineIndex += 1;

  if (lines[lineIndex] && !lines[lineIndex].startsWith("URI:")) {
    fields.statement = lines[lineIndex];
    lineIndex += 1;
  }

  while (lines[lineIndex] === "") lineIndex += 1;

  for (const { prefix, field } of FIELD_PREFIXES) {
    if (lines[lineIndex]?.startsWith(prefix)) {
      fields[field] = lines[lineIndex].slice(prefix.length);
      lineIndex += 1;
      continue;
    }

    const foundIndex = lines.findIndex((line) => line.startsWith(prefix));
    if (foundIndex >= 0) {
      fields[field] = lines[foundIndex].slice(prefix.length);
      parseErrors.push(
        issue(
          field,
          foundIndex + 1,
          `${prefix.trim().replace(":", "")} is out of order in the SIWE message`,
          "FIELD_OUT_OF_ORDER",
        ),
      );
    } else {
      parseErrors.push(issue(field, lineIndex + 1, `Missing required SIWE field: ${field}`, `MISSING_${field.toUpperCase()}`));
    }
  }

  for (const { prefix, field } of OPTIONAL_PREFIXES) {
    const foundIndex = lines.findIndex((line) => line.startsWith(prefix));
    if (foundIndex >= 0) fields[field] = lines[foundIndex].slice(prefix.length);
  }

  const resourcesIndex = lines.findIndex((line) => line === "Resources:");
  if (resourcesIndex >= 0) {
    const resources: string[] = [];
    for (let i = resourcesIndex + 1; i < lines.length; i += 1) {
      if (!lines[i].startsWith("- ")) break;
      resources.push(lines[i].slice(2));
    }
    if (resources.length > 0) fields.resources = resources;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) {
      parseErrors.push(issue(field, 1, `Missing required SIWE field: ${field}`, `MISSING_${field.toUpperCase()}`));
    }
  }

  return {
    fields,
    lines,
    rawMessage: message,
    normalizedMessage,
    parseErrors: dedupeIssues(parseErrors),
    isSiweLike: looksLikeSiweMessage(message),
  };
}

export function getSiweFieldLine(message: string, fieldName: keyof SiweMessageFields | "header" | "resources"): number {
  const lines = normalizeSiweLineEndings(message).split("\n");
  if (fieldName === "header" || fieldName === "domain") return 1;
  if (fieldName === "address") return 2;
  if (fieldName === "statement") {
    const uriIndex = lines.findIndex((line) => line.startsWith("URI: "));
    for (let i = 2; i < (uriIndex === -1 ? lines.length : uriIndex); i += 1) {
      if (lines[i] && !lines[i].startsWith("URI: ")) return i + 1;
    }
    return -1;
  }

  const prefixes: Record<string, string> = {
    uri: "URI: ",
    version: "Version: ",
    chainId: "Chain ID: ",
    nonce: "Nonce: ",
    issuedAt: "Issued At: ",
    expirationTime: "Expiration Time: ",
    notBefore: "Not Before: ",
    requestId: "Request ID: ",
    resources: "Resources:",
  };
  const prefix = prefixes[fieldName];
  if (!prefix) return -1;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  return index >= 0 ? index + 1 : -1;
}

function dedupeIssues(issues: SiweIssue[]): SiweIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.code}:${item.field}:${item.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
