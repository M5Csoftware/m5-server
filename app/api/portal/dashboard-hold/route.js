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
    const isHold = searchParams.get("isHold"); // NEW PARAMETER
    const limit = searchParams.get("limit") || 10; // NEW: Limit results

    if (!accountCode && !awbNo && !runNo && !clubNo && !manifestNo) {
      return NextResponse.json(
        {
          message:
            "At least one of accountCode, awbNo, manifestNo, runNo or clubNo is required",
        },
        { status: 400 },
      );
    }

    // Handle AWB number query
    if (awbNo) {
      const shipment = await Shipment.findOne({ awbNo });

      if (!shipment) {
        return NextResponse.json(
          { message: "No matching shipment found" },
          { status: 404 },
        );
      }

      return NextResponse.json({ shipment });
    }

    // Handle account code query - WITH HOLD FILTER
    if (accountCode) {
      let query = { accountCode };

      // If isHold parameter is provided, filter by hold status
      if (isHold === "true") {
        query = {
          accountCode,
          $or: [
            { isHold: true },
            {
              isHold: { $exists: false },
              status: { $regex: "hold", $options: "i" },
            },
            { holdReason: { $exists: true, $ne: "" } },
          ],
        };
      }

      const shipments = await Shipment.find(query)
        .sort({ date: -1 })
        .limit(parseInt(limit));

      if (shipments.length === 0) {
        return NextResponse.json(
          { message: "No shipments found" },
          { status: 404 },
        );
      }

      return NextResponse.json({
        shipments,
        count: shipments.length,
        isHold: isHold === "true", // Include flag in response
      });
    }

    // Handle run number query
    if (runNo) {
      const shipments = await Shipment.find({ runNo }).sort({ date: -1 });

      if (shipments.length === 0) {
        return NextResponse.json(
          { message: "No shipments found for this run number" },
          { status: 404 },
        );
      }

      return NextResponse.json({ shipments });
    }

    // Handle club number query
    if (clubNo) {
      const shipments = await Shipment.find({ clubNo }).sort({ date: -1 });

      if (shipments.length === 0) {
        return NextResponse.json(
          { message: "No shipments found for this club number" },
          { status: 404 },
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
          { status: 404 },
        );
      }

      return NextResponse.json({ shipments });
    }

    // Fallback (should not reach here)
    return NextResponse.json(
      { message: "Invalid query parameters" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Error fetching shipments:", error);
    return NextResponse.json(
      { message: "Error fetching shipments", error: error.message },
      { status: 500 },
    );
  }
}
