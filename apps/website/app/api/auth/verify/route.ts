import { NextRequest, NextResponse } from "next/server";
import { verifyMessageSignature } from "@/lib/viem";

const ADMIN_ETH_ADDRESSES = (process.env.ADMIN_ETH_ADDRESSES || "")
  .split(",")
  .map((addr) => addr.trim().toLowerCase())
  .filter(Boolean);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, message, signature } = body;

    if (!address || !message || !signature) {
      return NextResponse.json(
        { error: "Address, message, and signature are required" },
        { status: 400 }
      );
    }

    if (!ADMIN_ETH_ADDRESSES.includes(address.toLowerCase())) {
      return NextResponse.json(
        { error: "Address is not authorized as admin" },
        { status: 403 }
      );
    }

    try {
      const isValid = await verifyMessageSignature({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });

      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

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
      return NextResponse.json(
        { error: "Invalid timestamp" },
        { status: 401 }
      );
    }

    if (now - messageTimestamp > fiveMinutes) {
      return NextResponse.json(
        { error: "Signature expired. Please sign again." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      isAdmin: true,
      address: address.toLowerCase(),
    });
  } catch (error) {
    console.error("Error verifying admin signature:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
