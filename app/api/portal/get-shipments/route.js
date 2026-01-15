import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

// Ensure DB connection
connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");
    const awbNo = searchParams.get("awbNo");
    const runNo = searchParams.get("runNo");
    const clubNo = searchParams.get("clubNo");
    const manifestNo = searchParams.get("manifestNumber");

    if (!accountCode && !awbNo && !runNo && !clubNo && !manifestNo) {
      return NextResponse.json(
        {
          message:
            "At least one of accountCode, awbNo, manifestNo, runNo or clubNo is required",
        },
        { status: 400 }
      );
    }

    // Handle AWB number query
    if (awbNo) {
      const shipment = await Shipment.findOne({ awbNo });

      if (!shipment) {
        return NextResponse.json(
          { message: "No matching shipment found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ shipment });
    }

    // Handle account code query
    if (accountCode) {
      const shipments = await Shipment.find({ accountCode }).sort({ date: -1 });

      if (shipments.length === 0) {
        return NextResponse.json(
          { message: "No shipments found for this account" },
          { status: 404 }
        );
      }

      return NextResponse.json({ shipments });
    }

    // Handle run number query
    if (runNo) {
      const shipments = await Shipment.find({ runNo }).sort({ date: -1 });

      if (shipments.length === 0) {
        return NextResponse.json(
          { message: "No shipments found for this run number" },
          { status: 404 }
        );
      }

      return NextResponse.json({ shipments });
    }

    // Handle club number query - FIXED: Should return array not single object
    if (clubNo) {
      const shipments = await Shipment.find({ clubNo }).sort({ date: -1 });

      if (shipments.length === 0) {
        return NextResponse.json(
          { message: "No shipments found for this club number" },
          { status: 404 }
        );
      }

      return NextResponse.json({ shipments });
    }

    // Handle manifest number query
    if (manifestNo) {
      const shipments = await Shipment.find({ manifestNo }).sort({ date: -1 });

      if (shipments.length === 0) {
        return NextResponse.json(
          { message: "No shipments found for this manifest number" },
          { status: 404 }
        );
      }

      return NextResponse.json({ shipments });
    }

    // Fallback (should not reach here)
    return NextResponse.json(
      { message: "Invalid query parameters" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error fetching shipments:", error);
    return NextResponse.json(
      { message: "Error fetching shipments", error: error.message },
      { status: 500 }
    );
  }
}