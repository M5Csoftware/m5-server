import connectDB from "@/app/lib/db";
import Notification from "@/app/model/Notification";
import { NextResponse } from "next/server";


export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");

    if (!accountCode) {
      return NextResponse.json(
        { error: "accountCode is required" },
        { status: 400 },
      );
    }

    const count = await Notification.countDocuments({
      accountCode,
      isRead: false,
      isDeleted: false, // if you use soft delete
    });

    return NextResponse.json({ count }, { status: 200 });
  } catch (error) {
    console.error("Unread count error:", error);
    return NextResponse.json(
      { error: "Failed to fetch unread count" },
      { status: 500 },
    );
  }
}
