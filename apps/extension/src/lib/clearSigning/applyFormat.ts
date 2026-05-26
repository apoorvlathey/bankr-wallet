import { resolvePath, type PathValue } from "./resolvePath";
import type { Erc7730Descriptor, Erc7730Field, Erc7730Format } from "./types";

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
  | { kind: "calldata"; callee: string; data: string; amount?: string }
  | { kind: "missing" };

export interface RenderInput {
  /** Normalized decoded args (for calldata) or EIP-712 message (for sig). */
  data: unknown;
  /** Chain context — used by tokenAmount / amount formatters. */
  chainId: number;
}

interface RenderContext {
  descriptor?: Erc7730Descriptor;
}

export function applyFormat(
  format: Erc7730Format,
  input: RenderInput,
  descriptor?: Erc7730Descriptor,
): RenderedField[] {
  const fields = format.fields || [];
  const context: RenderContext = { descriptor };
  return fields
    .map((f) => renderField(f, input, context))
    .filter((f): f is RenderedField => f !== null);
}

function renderField(
  rawField: Erc7730Field,
  input: RenderInput,
  context: RenderContext,
): RenderedField | null {
  const field = resolveFieldReference(rawField, context);

  // Hidden by descriptor → drop entirely.
  if (field.visible === "never") return null;

  // Embedded calldata (ERC-7730 `calldata` format): the value at `field.path` is
  // bytes that themselves encode a call to another contract. Needs zipped
  // iteration with `params.calleePath` (callee per inner call) and optionally
  // `params.amountPath` / `params.selectorPath` — the generic array branch below
  // would only iterate one side, so handle it first.
  if ((field.format || "").toLowerCase() === "calldata" && field.path) {
    return renderCalldataField(field, input);
  }

  // Nested fields: iterate elements at `field.path` and apply child fields per element.
  if (field.fields && field.fields.length > 0) {
    if (!field.path) return null;
    const resolved = resolvePath(input.data, field.path);
    if (!Array.isArray(resolved)) return null;
    const groups: Array<RenderedField[]> = resolved.map((element) => {
      const childInput: RenderInput = { data: element, chainId: input.chainId };
      return (field.fields || [])
        .map((sub) => renderField(sub, childInput, context))
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
    const tokenAddrRaw =
      field.params && (field.params as Record<string, unknown>).tokenPath;
    const tokenAddrAt =
      typeof tokenAddrRaw === "string"
        ? resolvePath(input.data, tokenAddrRaw)
        : undefined;
    for (const item of raw) {
      const tokenAddrCandidate = Array.isArray(tokenAddrAt)
        ? tokenAddrAt[values.length]
        : tokenAddrAt;
      const tokenAddr =
        typeof tokenAddrCandidate === "string" ? tokenAddrCandidate : undefined;
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

/**
 * Render a `calldata`-format field. The path resolves to either a single hex
 * bytes value OR an array of hex bytes (when the path contains `[]`, e.g. Safe
 * BatchExecutor's `calls.[].data`). The callee/amount/selector params can each
 * be supplied as literals or as paths; when supplied as paths and the data side
 * iterates, the callee/amount/selector sides MUST iterate in lockstep — we zip
 * by index and drop the field if no callee can be paired with a data element.
 */
function renderCalldataField(
  field: Erc7730Field,
  input: RenderInput,
): RenderedField | null {
  if (!field.path) return null;
  const params = (field.params || {}) as Record<string, unknown>;

  const dataAt = resolvePath(input.data, field.path);
  if (dataAt === undefined) return null;

  const calleeLit = typeof params.callee === "string" ? params.callee : undefined;
  const calleeAt =
    typeof params.calleePath === "string"
      ? resolvePath(input.data, params.calleePath)
      : undefined;
  const amountLit =
    params.amount === undefined
      ? undefined
      : typeof params.amount === "bigint"
        ? (params.amount as bigint).toString()
        : String(params.amount);
  const amountAt =
    typeof params.amountPath === "string"
      ? resolvePath(input.data, params.amountPath)
      : undefined;
  // selector / selectorPath cover the case where the embedded bytes lack
  // their own 4-byte function selector (the caller supplies it separately).
  // We prepend it to `data` in `buildCalldataValue` so the nested
  // ClearSigningView's signature match has something to compute against.
  const selectorLit =
    typeof params.selector === "string" ? params.selector : undefined;
  const selectorAt =
    typeof params.selectorPath === "string"
      ? resolvePath(input.data, params.selectorPath)
      : undefined;

  const dataIsArray = Array.isArray(dataAt);
  const calleeIsArray = Array.isArray(calleeAt);
  const amountIsArray = Array.isArray(amountAt);
  const selectorIsArray = Array.isArray(selectorAt);

  if (!dataIsArray && !calleeIsArray && !amountIsArray && !selectorIsArray) {
    const value = buildCalldataValue(
      dataAt,
      calleeAt ?? calleeLit,
      amountAt ?? amountLit,
      selectorAt ?? selectorLit,
    );
    if (!value) return null;
    return { label: field.label || "", values: [value], visible: true };
  }

  // Zipped iteration. Use the data array's length as the source of truth;
  // pair each index with calleeAt[i] / amountAt[i] / selectorAt[i] when those
  // are arrays, or with the literal / single resolved value when they aren't.
  const dataArr = dataIsArray ? (dataAt as unknown[]) : [dataAt];
  const values: RenderedValue[] = [];
  for (let i = 0; i < dataArr.length; i++) {
    const data = dataArr[i];
    const callee = calleeIsArray
      ? (calleeAt as unknown[])[i]
      : (calleeAt ?? calleeLit);
    const amount = amountIsArray
      ? (amountAt as unknown[])[i]
      : (amountAt ?? amountLit);
    const selector = selectorIsArray
      ? (selectorAt as unknown[])[i]
      : (selectorAt ?? selectorLit);
    const v = buildCalldataValue(data, callee, amount, selector);
    if (v) values.push(v);
  }
  if (values.length === 0) return null;
  return { label: field.label || "", values, visible: true };
}

function buildCalldataValue(
  data: unknown,
  callee: unknown,
  amount: unknown,
  selector: unknown,
): RenderedValue | null {
  if (typeof data !== "string") return null;
  if (typeof callee !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(callee)) {
    return null;
  }
  const dataHex = data.startsWith("0x") ? data : `0x${data}`;
  // When the descriptor supplies a separate selector, the spec says the
  // embedded bytes don't include it — prepend so the nested view can match
  // against `data[0..10]`. Accept both `0x12345678` and `12345678` forms;
  // reject anything that isn't exactly 4 bytes (would silently corrupt the
  // calldata if we didn't validate).
  let finalData = dataHex;
  if (typeof selector === "string" && selector.length > 0) {
    const sel = selector.startsWith("0x") ? selector.slice(2) : selector;
    if (/^[0-9a-fA-F]{8}$/.test(sel)) {
      finalData = `0x${sel.toLowerCase()}${dataHex.slice(2)}`;
    }
  }
  const amountStr =
    amount === undefined || amount === null
      ? undefined
      : typeof amount === "bigint"
        ? amount.toString()
        : typeof amount === "number"
          ? String(amount)
          : typeof amount === "string"
            ? amount
            : undefined;
  return {
    kind: "calldata",
    callee,
    data: finalData,
    amount: amountStr,
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
      // Token address resolution order:
      //   1. tokenAddrFromOuter — passed in from an array-iterating parent
      //   2. params.tokenAddress — literal 0x address baked into the descriptor
      //      (used by built-in ERC-20 transfer descriptors where the token IS
      //       the contract being called)
      //   3. params.tokenPath — resolve from somewhere in the decoded args
      // No source → render as native chain currency.
      const literal =
        typeof params.tokenAddress === "string" && /^0x[a-fA-F0-9]{40}$/.test(params.tokenAddress)
          ? params.tokenAddress
          : undefined;
      const localTokenAddr =
        tokenAddrFromOuter ||
        literal ||
        (typeof params.tokenPath === "string"
          ? (resolvePath(input.data, params.tokenPath) as string | undefined)
          : undefined);
      const native = isNativeCurrencyToken(localTokenAddr, params);
      return {
        kind: "tokenAmount",
        amountRaw,
        tokenAddress: native ? undefined : localTokenAddr,
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

function resolveFieldReference(
  field: Erc7730Field,
  context: RenderContext,
  seen = new Set<string>(),
): Erc7730Field {
  if (!field.$ref) return resolveFieldParamReferences(field, context);

  const ref = field.$ref;
  if (seen.has(ref)) return resolveFieldParamReferences(stripRef(field), context);
  seen.add(ref);

  const referenced = resolveDescriptorPath(context.descriptor, ref);
  if (!isRecord(referenced)) {
    return resolveFieldParamReferences(stripRef(field), context);
  }

  const base = resolveFieldReference(referenced as Erc7730Field, context, seen);
  return resolveFieldParamReferences(mergeReferencedField(base, field), context);
}

function mergeReferencedField(
  base: Erc7730Field,
  override: Erc7730Field,
): Erc7730Field {
  const baseRest = { ...base };
  const baseParams = baseRest.params;
  const baseFields = baseRest.fields;
  delete baseRest.$ref;
  delete baseRest.params;
  delete baseRest.fields;

  const overrideRest = { ...override };
  const overrideParams = overrideRest.params;
  const overrideFields = overrideRest.fields;
  delete overrideRest.$ref;
  delete overrideRest.params;
  delete overrideRest.fields;

  const merged: Erc7730Field = {
    ...baseRest,
    ...overrideRest,
  };

  if (baseParams || overrideParams) {
    merged.params = {
      ...(baseParams || {}),
      ...(overrideParams || {}),
    };
  }

  const fields = overrideFields ?? baseFields;
  if (fields) merged.fields = fields;

  return merged;
}

function stripRef(field: Erc7730Field): Erc7730Field {
  const copy = { ...field };
  delete copy.$ref;
  return copy;
}

function resolveFieldParamReferences(
  field: Erc7730Field,
  context: RenderContext,
): Erc7730Field {
  if (!field.params) return field;
  return {
    ...field,
    params: resolveDescriptorReferences(field.params, context.descriptor) as Record<
      string,
      unknown
    >,
  };
}

function resolveDescriptorReferences(
  value: unknown,
  descriptor: Erc7730Descriptor | undefined,
): unknown {
  if (typeof value === "string" && value.startsWith("$.")) {
    const resolved = resolveDescriptorPath(descriptor, value);
    return resolved === undefined
      ? value
      : resolveDescriptorReferences(resolved, descriptor);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveDescriptorReferences(item, descriptor));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveDescriptorReferences(item, descriptor),
      ]),
    );
  }
  return value;
}

function resolveDescriptorPath(
  descriptor: Erc7730Descriptor | undefined,
  path: string,
): unknown {
  if (!descriptor || !path.startsWith("$.")) return undefined;
  let node: unknown = descriptor;
  for (const part of path.slice(2).split(".")) {
    if (!part) continue;
    if (!isRecord(node)) return undefined;
    node = node[part];
  }
  return node;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNativeCurrencyToken(
  tokenAddress: string | undefined,
  params: Record<string, unknown>,
): boolean {
  if (!tokenAddress) return true;
  const normalized = normalizeAddress(tokenAddress);
  if (!normalized) return false;

  const configured = collectNativeCurrencyAddresses(params.nativeCurrencyAddress);
  if (configured.includes(normalized)) return true;

  // Common sentinel addresses used by swap aggregators for native currency.
  return (
    normalized === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ||
    normalized === "0x0000000000000000000000000000000000000000"
  );
}

function collectNativeCurrencyAddresses(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => (typeof item === "string" ? normalizeAddress(item) : null))
    .filter((item): item is string => !!item);
}

function normalizeAddress(value: string): string | null {
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null;
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
