import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RoadmapItem } from "@/models/RoadmapItem";
import { verifyAdminRequest } from "@/lib/adminAuth";

// PUT - Admin: batch update order values
export async function PUT(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await connectDB();
    const body = await req.json();
    const { items } = body as { items: { id: string; order: number }[] };

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Items array is required" },
        { status: 400 }
      );
    }

    await RoadmapItem.bulkWrite(
      items.map(({ id, order }) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { order } },
        },
      }))
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering roadmap items:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
