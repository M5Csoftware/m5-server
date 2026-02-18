import connectDB from "@/app/lib/db";
import Notification from "@/app/model/Notification";
import { NextResponse } from "next/server";

export async function PATCH(req) {
  try {
    await connectDB();

    const { accountCode } = await req.json();

    if (!accountCode) {
      return NextResponse.json(
        { error: "accountCode required" },
        { status: 400 },
      );
    }

    await Notification.updateMany(
      { accountCode, isRead: false },
      { $set: { isRead: true } },
    );

    return NextResponse.json({ message: "All marked as read" });
  } catch (err) {
    console.error("Mark all error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
