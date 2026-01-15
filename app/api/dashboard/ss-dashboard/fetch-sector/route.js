import connectDB from "@/app/lib/db";
import AssignedSector from "@/app/model/AssignedSector";
import Employee from "@/app/model/Employee";
import User from "@/app/model/portal/User";
import dayjs from "dayjs";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ sectors: [] });
    }

    // Step A: find employee document first
    const emp = await Employee.findOne({ userId });

    if (!emp) {
      return NextResponse.json({ sectors: [] });
    }

    // Step B: find latest assigned sectors using employee _id
    const doc = await AssignedSector.findOne({ employeeId: emp._id }).sort({
      createdAt: -1,
    });

    if (!doc) {
      return NextResponse.json({ sectors: [] });
    }

    return NextResponse.json({
      sectors: doc.sectors || [],
      month: doc.month,
    });
  } catch (err) {
    console.log("SECTOR FETCH ERROR:", err);
    return NextResponse.json({ sectors: [] });
  }
}
