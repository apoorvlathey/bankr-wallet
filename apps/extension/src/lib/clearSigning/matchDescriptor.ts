import { toFunctionSelector } from "viem";

import type {
  Erc7730Descriptor,
  Erc7730Format,
  DescriptorKind,
} from "./types";

/**
 * Match a descriptor's `display.formats` entry against the current calldata or
 * EIP-712 typed data.
 *
 * For calldata, format keys look like:
 *   "exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params)"
 * We strip parameter names and compute the 4-byte selector, then match against
 * `calldata[0..10]`.
 *
 * For EIP-712, format keys look like the EIP-712 encoded type string:
 *   "PermitSingle(PermitDetails details,...)PermitDetails(address token,...)"
 * We compute that same encoded string from the typed data and match.
 */

export interface MatchedFormat {
  formatKey: string;
  format: Erc7730Format;
}

export function matchCalldataFormat(
  descriptor: Erc7730Descriptor,
  calldata: string,
): MatchedFormat | null {
  const formats = descriptor.display?.formats;
  if (!formats) return null;
  if (!calldata || !calldata.startsWith("0x") || calldata.length < 10) return null;
  const selector = calldata.slice(0, 10).toLowerCase();

  for (const [key, fmt] of Object.entries(formats)) {
    const sig = stripParamNames(key);
    if (!sig) continue;
    try {
      const sel = toFunctionSelector(sig).toLowerCase();
      if (sel === selector) return { formatKey: key, format: fmt };
    } catch {
      // ignore malformed signature
    }
  }
  return null;
}

export function matchEip712Format(
  descriptor: Erc7730Descriptor,
  typedData: { primaryType: string; types: Record<string, Array<{ name: string; type: string }>> },
): MatchedFormat | null {
  const formats = descriptor.display?.formats;
  if (!formats || !typedData?.primaryType || !typedData?.types) return null;

  const encoded = encodeType(typedData.primaryType, typedData.types);
  if (!encoded) return null;

  for (const [key, fmt] of Object.entries(formats)) {
    if (key === encoded) return { formatKey: key, format: fmt };
    // Tolerate harmless whitespace differences.
    if (key.replace(/\s+/g, "") === encoded.replace(/\s+/g, "")) {
      return { formatKey: key, format: fmt };
    }
  }
  return null;
}

export function verifyDeployment(
  descriptor: Erc7730Descriptor,
  kind: DescriptorKind,
  chainId: number,
  address: string,
): boolean {
  const deployments =
    kind === "calldata"
      ? descriptor.context?.contract?.deployments
      : descriptor.context?.eip712?.deployments;
  if (!deployments?.length) return false;
  const want = address.toLowerCase();
  return deployments.some(
    (d) => d.chainId === chainId && d.address?.toLowerCase() === want,
  );
}

/**
 * Strip parameter names from a function signature so it can be passed to
 * `toFunctionSelector`. Handles nested tuples by stripping any whitespace +
 * identifier that immediately precedes a `,` or `)`.
 *
 *   "exactInput((bytes path, address recipient, uint256 amountIn) params)"
 *   -> "exactInput((bytes,address,uint256))"
 */
export function stripParamNames(sig: string): string {
  // First trim trailing parenthesis junk; keep "name(" prefix intact.
  // Remove space-separated identifier tokens that follow a Solidity type token
  // and immediately precede `,` or `)`.
  return sig
    .replace(/\s+(?:indexed\s+)?[A-Za-z_$][A-Za-z0-9_$]*(?=\s*[,)])/g, "")
    .replace(/\s+/g, "");
}

/**
 * EIP-712 encodeType implementation per the spec.
 *
 * encodeType(primaryType) =
 *   primaryStruct ‖ deps sorted alphabetically by name, excluding primaryType
 * Each struct is rendered as:
 *   Name(type1 field1,type2 field2,...)
 */
export function encodeType(
  primaryType: string,
  types: Record<string, Array<{ name: string; type: string }>>,
): string | null {
  if (!types[primaryType]) return null;

  const deps = new Set<string>();
  collectDeps(primaryType, types, deps);
  deps.delete(primaryType);
  const sortedDeps = Array.from(deps).sort();

  const renderStruct = (name: string) => {
    const fields = types[name] || [];
    const inner = fields.map((f) => `${f.type} ${f.name}`).join(",");
    return `${name}(${inner})`;
  };

  return [primaryType, ...sortedDeps].map(renderStruct).join("");
}

function collectDeps(
  typeName: string,
  types: Record<string, Array<{ name: string; type: string }>>,
  out: Set<string>,
): void {
  if (out.has(typeName)) return;
  if (!types[typeName]) return;
  out.add(typeName);
  for (const field of types[typeName]) {
    const base = field.type.replace(/\[.*?\]/g, "");
    if (types[base]) collectDeps(base, types, out);
  }
}
