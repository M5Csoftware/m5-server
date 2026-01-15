import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import SalesTarget from "@/app/model/SalesTarget";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user");
    const month = searchParams.get("month"); // ex: "November-2025"

    if (!userId || !month) {
      return NextResponse.json(
        { error: "Missing user or month parameter" },
        { status: 400 }
      );
    }

    const data = await SalesTarget.findOne({ userId, month }).lean();

    if (!data) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      stateAssigned: data.stateAssigned || null,
      customersAssigned: data.customersAssigned || [],
      citiesAssigned: data.citiesAssigned || [],
      month: data.month,
      userId: data.userId,
    });
  } catch (err) {
    console.error("get-sales error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
