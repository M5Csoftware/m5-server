import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    console.log("Received params:", { runNo, fromDate, toDate });

    // Build query based on parameters
    let query = {};

    if (runNo) {
      // Specific run number
      query.runNo = runNo;
    } else if (fromDate && toDate) {
      // Date range for ALL checkbox
      query.date = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    } else if (fromDate || toDate) {
      return NextResponse.json(
        {
          success: false,
          message: "Both fromDate and toDate are required for date range query",
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "Please provide either runNo or date range (fromDate and toDate)",
        },
        { status: 400 }
      );
    }

    // Fetch bagging data
    const baggingData = await Bagging.find(query).lean();

    console.log("Bagging data count:", baggingData.length);

    if (!baggingData || baggingData.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No bagging data found",
        },
        { status: 404 }
      );
    }

    // Process each bagging record
    const summaryData = await Promise.all(
      baggingData.map(async (bag) => {
        // Extract AWB numbers from rowData
        const awbNumbers = [];
        if (bag.rowData && Array.isArray(bag.rowData)) {
          bag.rowData.forEach((row) => {
            if (row.awbNo) {
              awbNumbers.push(row.awbNo);
            }
          });
        }

        // Fetch shipment data for all AWBs in this bag
        let totalActualWt = 0;
        let chargableWt = 0;

        if (awbNumbers.length > 0) {
          const shipments = await Shipment.find({
            awbNo: { $in: awbNumbers },
          }).lean();

          // Calculate totals
          shipments.forEach((shipment) => {
            totalActualWt += Number(shipment.totalActualWt) || 0;
            chargableWt += Number(shipment.chargableWt) || 0;
          });
        }

        // Format date
        const flightDate = bag.date
          ? new Date(bag.date).toISOString().split("T")[0]
          : "";

        return {
          runNo: bag.runNo || "",
          flightDate: flightDate,
          alMawb: bag.alMawb || "",
          obc: bag.obc || "",
          flight: bag.flight || "",
          counterPart: bag.counterPart || "",
          countBag: bag.noOfBags || 0,
          countAwb: bag.noOfAwb || 0,
          bagWeight: bag.runWeight || 0,
          totalActualWt: Number(totalActualWt.toFixed(2)),
          chargableWt: Number(chargableWt.toFixed(2)),
        };
      })
    );

    console.log("Summary data prepared, count:", summaryData.length);

    return NextResponse.json({
      success: true,
      data: summaryData,
      count: summaryData.length,
    });
  } catch (error) {
    console.error("Error fetching run summary:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error.message,
      },
      { status: 500 }
    );
  }
}