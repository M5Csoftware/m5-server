import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Zone from "@/app/model/Zone";

export async function GET(req) {
  await connectDB();
  try {
    const sector = req.nextUrl.searchParams.get("sector");

    if (!sector) {
      return NextResponse.json(
        { error: "Sector is required" },
        { status: 400 }
      );
    }

    const zones = await Zone.find({ sector });
    return NextResponse.json(zones, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
