export type SiweIssueSeverity = "error" | "warning" | "info";

export interface SiweIssue {
  type: "format" | "security" | "compliance";
  field: string;
  line: number;
  message: string;
  severity: SiweIssueSeverity;
  code: string;
  suggestion?: string;
}

export interface SiweMessageFields {
  scheme?: string;
  domain?: string;
  address?: string;
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

export interface ParsedSiweMessage {
  fields: SiweMessageFields;
  lines: string[];
  rawMessage: string;
  normalizedMessage: string;
  parseErrors: SiweIssue[];
  isSiweLike: boolean;
}

export interface SiweValidationContext {
  origin?: string;
  signerAddress?: string | null;
  connectedChainId?: number;
}

export interface SiweAnalysis {
  fields: SiweMessageFields;
  rawMessage: string;
  normalizedMessage: string;
  issues: SiweIssue[];
  errors: SiweIssue[];
  warnings: SiweIssue[];
  suggestions: SiweIssue[];
  isValid: boolean;
  originHost?: string;
}
