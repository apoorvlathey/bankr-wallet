import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRoadmapItem extends Document {
  title: string;
  description?: string;
  status: "done" | "in-progress" | "planned" | "idea";
  category?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const RoadmapItemSchema = new Schema<IRoadmapItem>(
  {
    title: { type: String, required: true },
    description: { type: String },
    status: {
      type: String,
      enum: ["done", "in-progress", "planned", "idea"],
      required: true,
      default: "planned",
    },
    category: { type: String },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

RoadmapItemSchema.index({ order: 1 });

export const RoadmapItem: Model<IRoadmapItem> =
  mongoose.models.RoadmapItem ||
  mongoose.model<IRoadmapItem>("RoadmapItem", RoadmapItemSchema);
