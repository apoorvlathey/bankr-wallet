import { NextRequest, NextResponse } from "next/server";
import { verifyMessageSignature } from "./viem";

const ADMIN_ETH_ADDRESSES = (process.env.ADMIN_ETH_ADDRESSES || "")
  .split(",")
  .map((addr) => addr.trim().toLowerCase())
  .filter(Boolean);

/**
 * Verify admin request headers (stateless, re-verifies every call).
 * Returns the verified address on success, or a NextResponse error on failure.
 */
export async function verifyAdminRequest(
  req: NextRequest
): Promise<{ address: string } | NextResponse> {
  const signature = req.headers.get("x-admin-signature");
  const encodedMessage = req.headers.get("x-admin-message");
  const address = req.headers.get("x-admin-address");

  if (!signature || !encodedMessage || !address) {
    return NextResponse.json(
      { error: "Missing admin auth headers" },
      { status: 401 }
    );
  }

  if (!ADMIN_ETH_ADDRESSES.includes(address.toLowerCase())) {
    return NextResponse.json(
      { error: "Address is not authorized as admin" },
      { status: 403 }
    );
  }

  const message = atob(encodedMessage);

  try {
    const isValid = await verifyMessageSignature({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Check timestamp
  const timestampMatch = message.match(/Timestamp: (\d+)/);
  if (!timestampMatch) {
    return NextResponse.json(
      { error: "Invalid message format" },
      { status: 401 }
    );
  }

  const messageTimestamp = parseInt(timestampMatch[1]);
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (messageTimestamp > now + 30000) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 401 });
  }

  if (now - messageTimestamp > fiveMinutes) {
    return NextResponse.json(
      { error: "Signature expired. Please sign again." },
      { status: 401 }
    );
  }

  return { address: address.toLowerCase() };
}
