export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const BUNGEE_NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const ERC20_ALLOWANCE_SELECTOR = "0xdd62ed3e";
const PERMIT2_ALLOWANCE_SELECTOR = "0x927da105";
const PERMIT2_APPROVE_SELECTOR = "0x87517c45";
const MAX_UINT160 = (1n << 160n) - 1n;

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isHex(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);
}

export function isNativeToken(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
    lower === BUNGEE_NATIVE_TOKEN ||
    lower === ZERO_ADDRESS ||
    lower === "native" ||
    lower === "eth";
}

export function normalizeAddress(value: unknown, label = "address"): `0x${string}` {
  if (isAddress(value)) return value;
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

export function normalizeTokenAddress(value: string, nativeSentinel = NATIVE_TOKEN_ADDRESS): string {
  return isNativeToken(value) ? nativeSentinel : normalizeAddress(value, "token address");
}

export function normalizeHexQuantity(value: unknown, label: string): `0x${string}` {
  if (value === undefined || value === null || value === "") return "0x0";
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`${label} cannot be negative`);
    return `0x${value.toString(16)}`;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return `0x${value.toString(16)}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^0x[0-9a-fA-F]*$/.test(trimmed)) return trimmed as `0x${string}`;
    if (/^[0-9]+$/.test(trimmed)) return `0x${BigInt(trimmed).toString(16)}`;
  }
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

export function parseDecimalAmount(amount: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`Invalid token decimals: ${decimals}`);
  }

  const trimmed = amount.trim();
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(trimmed)) {
    throw new Error(`Amount must be a decimal string, got: ${amount}`);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(
      `Amount has ${fraction.length} fractional digits, but token only has ${decimals} decimals`,
    );
  }

  const raw = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return raw || "0";
}

export function encodeErc20Approve(spender: string, amount: string | bigint): `0x${string}` {
  return `${ERC20_APPROVE_SELECTOR}${padAddress(spender)}${padUint(amount)}` as `0x${string}`;
}

export function encodeErc20Allowance(owner: string, spender: string): `0x${string}` {
  return `${ERC20_ALLOWANCE_SELECTOR}${padAddress(owner)}${padAddress(spender)}` as `0x${string}`;
}

export function encodePermit2Allowance(owner: string, token: string, spender: string): `0x${string}` {
  return `${PERMIT2_ALLOWANCE_SELECTOR}${padAddress(owner)}${padAddress(token)}${padAddress(spender)}` as `0x${string}`;
}

export function encodePermit2Approve(
  token: string,
  spender: string,
  amount: string | bigint,
  expiration = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
): `0x${string}` {
  const capped = BigInt(amount) > MAX_UINT160 ? MAX_UINT160 : BigInt(amount);
  return `${PERMIT2_APPROVE_SELECTOR}${padAddress(token)}${padAddress(spender)}${padUint(capped)}${padUint(expiration)}` as `0x${string}`;
}

export function decodeUintResult(value: string): string {
  if (!isHex(value) || value === "0x") return "0";
  return BigInt(value).toString();
}

export function decodePermit2AllowanceResult(value: string): {
  amount: string;
  expiration: number;
  nonce: number;
} {
  if (!isHex(value) || value.length < 194) {
    return { amount: "0", expiration: 0, nonce: 0 };
  }
  const words = value.slice(2).match(/.{1,64}/g) ?? [];
  return {
    amount: BigInt(`0x${words[0] || "0"}`).toString(),
    expiration: Number(BigInt(`0x${words[1] || "0"}`)),
    nonce: Number(BigInt(`0x${words[2] || "0"}`)),
  };
}

function padAddress(value: string): string {
  const address = normalizeAddress(value);
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function padUint(value: string | number | bigint): string {
  const bigint = BigInt(value);
  if (bigint < 0n) throw new Error("Cannot ABI-encode negative uint");
  return bigint.toString(16).padStart(64, "0");
}
