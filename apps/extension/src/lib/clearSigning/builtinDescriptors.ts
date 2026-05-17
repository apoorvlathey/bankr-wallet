/**
 * Built-in (client-side) ERC-7730 descriptors for well-known generic
 * function selectors.
 *
 * The remote registry at walletchan.com/api/clearsigning/descriptor is keyed
 * by (chainId, contract address) — fine for per-app contracts (Permit2,
 * Uniswap router, etc.), but useless for "every ERC-20 ever deployed".
 * Rather than seeding the registry with thousands of duplicate entries we
 * synthesize a descriptor here on demand.
 *
 * Returns null when the calldata isn't a recognized built-in selector. The
 * remote descriptor always wins — built-ins are a fallback for unknown
 * contracts that happen to expose a standard function.
 */

import type { Erc7730Descriptor } from "./types";

/** Selectors handled here. Keep in sync with the switch in `getBuiltinCalldataDescriptor`. */
const BUILTIN_SELECTORS = new Set<string>([
  "0xa9059cbb", // transfer(address,uint256)
  "0x095ea7b3", // approve(address,uint256)
]);

export function isBuiltinCalldataSelector(calldata: string | undefined | null): boolean {
  if (!calldata || !calldata.startsWith("0x") || calldata.length < 10) return false;
  return BUILTIN_SELECTORS.has(calldata.slice(0, 10).toLowerCase());
}

export function getBuiltinCalldataDescriptor(
  chainId: number,
  contractAddress: string,
  calldata: string,
): Erc7730Descriptor | null {
  if (!calldata || !calldata.startsWith("0x") || calldata.length < 10) return null;
  if (!chainId || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) return null;

  const selector = calldata.slice(0, 10).toLowerCase();

  switch (selector) {
    case "0xa9059cbb":
      return erc20TransferDescriptor(chainId, contractAddress);
    case "0x095ea7b3":
      return erc20ApproveDescriptor(chainId, contractAddress);
    default:
      return null;
  }
}

/**
 * Shared boilerplate — every built-in ERC-20 descriptor targets the same
 * (chainId, contractAddress) deployment and is labelled "via ERC-20" via
 * the owner metadata. The amount field hardcodes the call target as its
 * token address (the token IS the contract being called), so TokenAmount
 * formatters can resolve symbol/decimals/logo/price exactly the way they
 * do for app-specific descriptors.
 */
function erc20DescriptorBase(chainId: number, contractAddress: string) {
  return {
    context: {
      contract: {
        deployments: [{ chainId, address: contractAddress.toLowerCase() }],
      },
    },
    metadata: { owner: "ERC-20" as const },
  };
}

/** `transfer(address to, uint256 amount)` — ERC-20 send. */
function erc20TransferDescriptor(chainId: number, contractAddress: string): Erc7730Descriptor {
  return {
    ...erc20DescriptorBase(chainId, contractAddress),
    display: {
      formats: {
        "transfer(address to,uint256 amount)": {
          intent: "Send tokens",
          fields: [
            {
              path: "#.amount",
              label: "Amount",
              format: "tokenAmount",
              params: { tokenAddress: contractAddress.toLowerCase() },
            },
            { path: "#.to", label: "Recipient", format: "addressName" },
          ],
        },
      },
    },
  };
}

/** `approve(address spender, uint256 amount)` — ERC-20 allowance grant. */
function erc20ApproveDescriptor(chainId: number, contractAddress: string): Erc7730Descriptor {
  return {
    ...erc20DescriptorBase(chainId, contractAddress),
    display: {
      formats: {
        "approve(address spender,uint256 amount)": {
          intent: "Approve token",
          fields: [
            {
              path: "#.amount",
              label: "Amount",
              format: "tokenAmount",
              params: { tokenAddress: contractAddress.toLowerCase() },
            },
            { path: "#.spender", label: "Spender", format: "addressName" },
          ],
        },
      },
    },
  };
}
