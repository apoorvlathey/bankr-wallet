import { NextRequest, NextResponse } from "next/server";
import {
  isAddress,
  verifyTypedData,
  hexToSignature,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { createRelayerWalletClient } from "../../../lib/viem";
import { WCHAN_VAULT_INDEXER_API_URL } from "../../constants";
import { BASE_USDC_ADDRESS } from "@walletchan/shared/contracts";

/** 20 million sWCHAN (18 decimals) */
const PREMIUM_THRESHOLD = 20_000_000n * 10n ** 18n;

/** Rate limiter: per-address sliding window */
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(address: string): boolean {
  const now = Date.now();
  const key = address.toLowerCase();
  const timestamps = rateLimitMap.get(key) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  rateLimitMap.set(key, recent);
  return true;
}

/** EIP-712 domain for USDC on Base */
const USDC_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: BASE_USDC_ADDRESS as `0x${string}`,
} as const;

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/** Kill switch: set SPONSORED_USDC_TRANSFER_DISABLED=true to disable gasless transfers */
const isSponsoredDisabled =
  process.env.SPONSORED_USDC_TRANSFER_DISABLED?.toLowerCase() === "true";

export async function POST(req: NextRequest) {
  if (isSponsoredDisabled) {
    return NextResponse.json(
      { error: "Sponsored transfers are temporarily disabled" },
      { status: 503 }
    );
  }

  let body: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
    signature: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { from, to, value, validAfter, validBefore, nonce, signature } = body;

  // --- Validate fields ---
  if (!from || !isAddress(from)) {
    return NextResponse.json({ error: "Invalid from address" }, { status: 400 });
  }
  if (!to || !isAddress(to)) {
    return NextResponse.json({ error: "Invalid to address" }, { status: 400 });
  }
  if (!value || BigInt(value) <= 0n) {
    return NextResponse.json({ error: "Value must be > 0" }, { status: 400 });
  }
  if (!nonce || !nonce.startsWith("0x")) {
    return NextResponse.json({ error: "Invalid nonce" }, { status: 400 });
  }
  if (!signature || !signature.startsWith("0x")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const validBeforeBn = BigInt(validBefore);
  if (validBeforeBn <= BigInt(Math.floor(Date.now() / 1000))) {
    return NextResponse.json(
      { error: "Authorization has expired" },
      { status: 400 }
    );
  }

  // --- Rate limit ---
  if (!checkRateLimit(from)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  // --- Verify EIP-712 signature ---
  try {
    const isValid = await verifyTypedData({
      address: from as `0x${string}`,
      domain: USDC_DOMAIN,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: from as `0x${string}`,
        to: to as `0x${string}`,
        value: BigInt(value),
        validAfter: BigInt(validAfter),
        validBefore: validBeforeBn,
        nonce: nonce as `0x${string}`,
      },
      signature: signature as Hex,
    });

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 401 }
    );
  }

  // --- Check premium status ---
  try {
    const res = await fetch(
      `${WCHAN_VAULT_INDEXER_API_URL}/balances/${from.toLowerCase()}`
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Insufficient sWCHAN balance for sponsored transfers" },
        { status: 403 }
      );
    }

    const data = await res.json();
    const balance = BigInt(data.shares);

    if (balance < PREMIUM_THRESHOLD) {
      return NextResponse.json(
        { error: "Insufficient sWCHAN balance for sponsored transfers. Need 20M+ sWCHAN." },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to verify premium status" },
      { status: 502 }
    );
  }

  // --- Broadcast transferWithAuthorization ---
  try {
    const walletClient = createRelayerWalletClient();
    const { v, r, s } = hexToSignature(signature as Hex);

    const txHash = await walletClient.writeContract({
      chain: base,
      address: BASE_USDC_ADDRESS as `0x${string}`,
      abi: TRANSFER_WITH_AUTHORIZATION_ABI,
      functionName: "transferWithAuthorization",
      args: [
        from as `0x${string}`,
        to as `0x${string}`,
        BigInt(value),
        BigInt(validAfter),
        validBeforeBn,
        nonce as `0x${string}`,
        Number(v),
        r,
        s,
      ],
    });

    return NextResponse.json({ success: true, txHash });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Transaction broadcast failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
