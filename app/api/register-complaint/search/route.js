// app/api/register-complaint/search.js
import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();
    const { complaintNo, complaintID } = Object.fromEntries(
      new URL(req.url).searchParams
    );

    if (!complaintNo && !complaintID) {
      return NextResponse.json(
        { success: false, message: "Provide complaintNo or complaintID" },
        { status: 400 }
      );
    }

    const complaint = await Complaint.findOne({
      $or: [
        complaintNo ? { complaintNo } : null,
        complaintID ? { complaintID } : null,
      ].filter(Boolean),
    });

    if (!complaint) {
      return NextResponse.json(
        { success: false, message: "Complaint not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, complaint });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
