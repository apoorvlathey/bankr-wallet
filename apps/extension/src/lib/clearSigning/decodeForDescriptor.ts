/**
 * Decode calldata using the descriptor's own format key (the human-readable
 * function signature). We don't rely on the broader CalldataDecoder pipeline
 * because:
 *   - the descriptor already tells us the exact signature,
 *   - we want a synchronous, no-network decode at clear-signing time.
 *
 * Output is a normalized object keyed by parameter name, ready for
 * `resolvePath` to walk.
 */

import { decodeFunctionData, parseAbiItem, type AbiParameter } from "viem";

export function decodeCalldataForDescriptor(
  formatKey: string,
  calldata: string,
): Record<string, unknown> | null {
  if (!calldata?.startsWith("0x")) return null;
  let abiItem: ReturnType<typeof parseAbiItem>;
  try {
    abiItem = parseAbiItem(`function ${formatKey}`);
  } catch (err) {
    console.warn("[clear-signing] parseAbiItem failed:", err);
    return null;
  }
  if (abiItem.type !== "function") return null;

  let decoded: { functionName: string; args?: readonly unknown[] };
  try {
    decoded = decodeFunctionData({
      abi: [abiItem],
      data: calldata as `0x${string}`,
    });
  } catch (err) {
    console.warn("[clear-signing] decodeFunctionData failed:", err);
    return null;
  }

  return zipInputs(abiItem.inputs, decoded.args || []);
}

function zipInputs(
  inputs: readonly AbiParameter[],
  args: readonly unknown[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  inputs.forEach((input, i) => {
    const name = input.name || String(i);
    out[name] = normalize(input, args[i]);
  });
  return out;
}

function normalize(input: AbiParameter, value: unknown): unknown {
  const type = input.type;

  // Tuples — viem returns named tuples as plain objects when the components
  // have names; positional arrays when they don't.
  if (type === "tuple") {
    const components = (input as { components?: readonly AbiParameter[] }).components || [];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj: Record<string, unknown> = {};
      for (const comp of components) {
        const k = comp.name || "";
        obj[k] = normalize(comp, (value as Record<string, unknown>)[k]);
      }
      return obj;
    }
    if (Array.isArray(value)) {
      const obj: Record<string, unknown> = {};
      components.forEach((comp, i) => {
        obj[comp.name || String(i)] = normalize(comp, (value as unknown[])[i]);
      });
      return obj;
    }
    return value;
  }

  // Arrays (`type[]`, `type[N]`, `tuple[]`, …).
  if (type.endsWith("]") && Array.isArray(value)) {
    const inner = type.replace(/\[[^\]]*\]$/, "");
    const innerInput = {
      ...input,
      type: inner,
    } as AbiParameter;
    return (value as unknown[]).map((v) => normalize(innerInput, v));
  }

  if (typeof value === "bigint") return value.toString();
  return value;
}
