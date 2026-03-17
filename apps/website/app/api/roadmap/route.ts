import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RoadmapItem } from "@/models/RoadmapItem";
import { verifyAdminRequest } from "@/lib/adminAuth";

// GET - Public: fetch all roadmap items sorted by order
export async function GET() {
  try {
    await connectDB();
    const items = await RoadmapItem.find().sort({ order: 1 }).lean();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching roadmap items:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Admin: create a new roadmap item
export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await connectDB();
    const body = await req.json();
    const { title, description, status, category } = body;

    if (!title || !status) {
      return NextResponse.json(
        { error: "Title and status are required" },
        { status: 400 }
      );
    }

    // Set order to max + 1
    const maxItem = await RoadmapItem.findOne().sort({ order: -1 }).lean();
    const order = maxItem ? maxItem.order + 1 : 0;

    const item = await RoadmapItem.create({
      title,
      description,
      status,
      category,
      order,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Error creating roadmap item:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Admin: update a roadmap item
export async function PUT(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await connectDB();
    const body = await req.json();
    const { id, title, description, status, category } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Item id is required" },
        { status: 400 }
      );
    }

    const item = await RoadmapItem.findByIdAndUpdate(
      id,
      { title, description, status, category },
      { new: true }
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error updating roadmap item:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Admin: delete a roadmap item
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await connectDB();
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Item id is required" },
        { status: 400 }
      );
    }

    const item = await RoadmapItem.findByIdAndDelete(id);

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting roadmap item:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
