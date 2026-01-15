import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import { NextResponse } from "next/server";

connectDB();

export async function PATCH(req) {
  try {
    const { userId, deactivateReason } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const employee = await Employee.findOneAndUpdate(
      { userId },
      { deactivated: true, deactivateReason },
      { new: true }
    );

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Employee deactivated", employee });
  } catch (error) {
    console.error("Deactivate error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
