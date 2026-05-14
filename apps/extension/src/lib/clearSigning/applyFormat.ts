import { resolvePath, type PathValue } from "./resolvePath";
import type { Erc7730Field, Erc7730Format } from "./types";

/**
 * Apply a descriptor `display.formats[…]` to a normalized data root (calldata
 * args object or EIP-712 message object), producing a tree of "rendered fields"
 * ready for the React layer to display.
 *
 * Pure module — no React, no network. The renderer turns each `RenderedValue`
 * into the right Chakra primitive (AddressInline, token-amount badge, etc.).
 */

export interface RenderedField {
  label: string;
  /** When the path iterates ([]), one rendered value per element. */
  values: RenderedValue[];
  visible: boolean;
  /** Nested fields produced via `details.[]` style iteration. */
  groups?: Array<RenderedField[]>;
}

export type RenderedValue =
  | { kind: "raw"; text: string }
  | { kind: "address"; address: string }
  | { kind: "tokenAmount"; amountRaw: string; tokenAddress?: string; native?: boolean }
  | { kind: "amount"; amountRaw: string }
  | { kind: "date"; timestamp: number }
  | { kind: "unit"; raw: string; decimals: number; base?: string; prefix: boolean }
  | { kind: "missing" };

export interface RenderInput {
  /** Normalized decoded args (for calldata) or EIP-712 message (for sig). */
  data: unknown;
  /** Chain context — used by tokenAmount / amount formatters. */
  chainId: number;
}

export function applyFormat(
  format: Erc7730Format,
  input: RenderInput,
): RenderedField[] {
  const fields = format.fields || [];
  return fields
    .map((f) => renderField(f, input))
    .filter((f): f is RenderedField => f !== null);
}

function renderField(
  field: Erc7730Field,
  input: RenderInput,
): RenderedField | null {
  // Hidden by descriptor → drop entirely.
  if (field.visible === "never") return null;

  // Nested fields: iterate elements at `field.path` and apply child fields per element.
  if (field.fields && field.fields.length > 0) {
    if (!field.path) return null;
    const resolved = resolvePath(input.data, field.path);
    if (!Array.isArray(resolved)) return null;
    const groups: Array<RenderedField[]> = resolved.map((element) => {
      const childInput: RenderInput = { data: element, chainId: input.chainId };
      return (field.fields || [])
        .map((sub) => renderField(sub, childInput))
        .filter((r): r is RenderedField => r !== null);
    });
    return {
      label: field.label || "",
      values: [],
      groups,
      visible: true,
    };
  }

  if (!field.path) return null;
  const raw = resolvePath(input.data, field.path);
  if (raw === undefined) {
    return null;
  }

  // Iteration over an array (e.g. path ends in `[]`) — render one value per item.
  if (Array.isArray(raw)) {
    const values: RenderedValue[] = [];
    for (const item of raw) {
      const tokenAddrRaw = field.params && (field.params as Record<string, unknown>).tokenPath;
      const tokenAddr =
        typeof tokenAddrRaw === "string"
          ? (resolvePath(input.data, tokenAddrRaw) as string | undefined)
          : undefined;
      values.push(toRenderedValue(field, item, input, tokenAddr));
    }
    return {
      label: field.label || "",
      values,
      visible: true,
    };
  }

  const tokenAddrRaw =
    field.params && (field.params as Record<string, unknown>).tokenPath;
  const tokenAddr =
    typeof tokenAddrRaw === "string"
      ? (resolvePath(input.data, tokenAddrRaw) as string | undefined)
      : undefined;

  return {
    label: field.label || "",
    values: [toRenderedValue(field, raw, input, tokenAddr)],
    visible: true,
  };
}

function toRenderedValue(
  field: Erc7730Field,
  raw: PathValue,
  input: RenderInput,
  tokenAddrFromOuter: string | undefined,
): RenderedValue {
  const format = (field.format || "raw").toLowerCase();
  const params = (field.params || {}) as Record<string, unknown>;

  if (raw === undefined || raw === null) return { kind: "missing" };

  switch (format) {
    case "addressname":
    case "addressName".toLowerCase(): {
      const text = String(raw);
      return /^0x[0-9a-fA-F]{40}$/.test(text)
        ? { kind: "address", address: text }
        : { kind: "raw", text };
    }
    case "tokenamount":
    case "tokenAmount".toLowerCase(): {
      const amountRaw = stringifyAmount(raw);
      const localTokenAddr =
        tokenAddrFromOuter ||
        (typeof params.tokenPath === "string"
          ? (resolvePath(input.data, params.tokenPath) as string | undefined)
          : undefined);
      const native = !localTokenAddr;
      return {
        kind: "tokenAmount",
        amountRaw,
        tokenAddress: localTokenAddr,
        native,
      };
    }
    case "amount": {
      return { kind: "amount", amountRaw: stringifyAmount(raw) };
    }
    case "date": {
      const encoding = String(params.encoding || "timestamp");
      const n = Number(raw);
      if (!Number.isFinite(n)) return { kind: "raw", text: String(raw) };
      // We treat blockheight encodings as raw for now (chain-specific lookup not wired).
      if (encoding !== "timestamp") return { kind: "raw", text: String(raw) };
      return { kind: "date", timestamp: n };
    }
    case "unit": {
      const decimals = Number(params.decimals ?? 0);
      const base = typeof params.base === "string" ? params.base : undefined;
      const prefix = params.prefix === true;
      return {
        kind: "unit",
        raw: stringifyAmount(raw),
        decimals: Number.isFinite(decimals) ? decimals : 0,
        base,
        prefix,
      };
    }
    case "raw":
    default: {
      const text = stringifyValue(raw);
      // If the value happens to be a 0x-address, render it as an address for UX.
      if (typeof raw === "string" && /^0x[0-9a-fA-F]{40}$/.test(raw)) {
        return { kind: "address", address: raw };
      }
      return { kind: "raw", text };
    }
  }
}

function stringifyAmount(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return String(v);
}

function stringifyValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
