// app/api/alert-notif/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");

    // If no AWB, return all alert messages
    if (!awbNo) {
      const alerts = await Shipment.find(
        {},
        "awbNo notifType notifMsg" // only return needed fields
      ).sort({ createdAt: -1 });

      return NextResponse.json(alerts);
    }

    // Find shipment by AWB number
    const shipment = await Shipment.findOne({
      awbNo: awbNo.trim().toUpperCase(),
    });

    if (!shipment) {
      return NextResponse.json(
        { error: "Shipment not found", exists: false },
        { status: 404 }
      );
    }

    // Return notification details
    return NextResponse.json({
      awbNo: shipment.awbNo,
      notifType: shipment.notifType || "Close",
      notifMsg: shipment.notifMsg || "",
      exists: true,
    });
  } catch (error) {
    console.error("Error fetching alert message:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { awbNo, notifType, notifMsg } = body;

    if (!awbNo) {
      return NextResponse.json(
        { error: "AWB number is required" },
        { status: 400 }
      );
    }

    // Validate notifType
    if (notifType && !["Open", "Close"].includes(notifType)) {
      return NextResponse.json(
        { error: "Invalid notification type. Must be 'Open' or 'Close'" },
        { status: 400 }
      );
    }

    // Find shipment
    const shipment = await Shipment.findOne({
      awbNo: awbNo.trim().toUpperCase(),
    });

    if (!shipment) {
      return NextResponse.json(
        {
          error: "Shipment not found. Please create the shipment first.",
          exists: false,
        },
        { status: 404 }
      );
    }

    // Update notification fields
    shipment.notifType = notifType || "Close";
    shipment.notifMsg = notifType === "Open" ? notifMsg || "" : "";

    await shipment.save();

    return NextResponse.json({
      message: "Alert message updated successfully",
      awbNo: shipment.awbNo,
      notifType: shipment.notifType,
      notifMsg: shipment.notifMsg,
    });
  } catch (error) {
    console.error("Error updating alert message:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  // Reuse POST logic for PUT requests
  return POST(request);
}
