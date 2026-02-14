// app/api/portal/get-shipments/route.js
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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

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

    // Build date filter if provided
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }
    }

    // Handle account code query
    if (accountCode) {
      const query = { accountCode, ...dateFilter };
      const shipments = await Shipment.find(query).sort({ createdAt: -1 });

      if (shipments.length === 0) {
        return NextResponse.json({
          shipments: [],
          message: "No shipments found for this account in the selected date range",
        });
      }

      return NextResponse.json({ shipments });
    }

    // Handle run number query
    if (runNo) {
      const query = { runNo, ...dateFilter };
      const shipments = await Shipment.find(query).sort({ createdAt: -1 });

      if (shipments.length === 0) {
        return NextResponse.json({
          shipments: [],
          message: "No shipments found for this run number in the selected date range",
        });
      }

      return NextResponse.json({ shipments });
    }

    // Handle club number query
    if (clubNo) {
      const query = { clubNo, ...dateFilter };
      const shipments = await Shipment.find(query).sort({ createdAt: -1 });

      if (shipments.length === 0) {
        return NextResponse.json({
          shipments: [],
          message: "No shipments found for this club number in the selected date range",
        });
      }

      return NextResponse.json({ shipments });
    }

    // Handle manifest number query
    if (manifestNo) {
      const query = { manifestNo, ...dateFilter };
      const shipments = await Shipment.find(query).sort({ createdAt: -1 });

      if (shipments.length === 0) {
        return NextResponse.json({
          shipments: [],
          message: "No shipments found for this manifest number in the selected date range",
        });
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