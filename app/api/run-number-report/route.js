import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import RunEntry from "@/app/model/RunEntry";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");
    const runNo = searchParams.get("runNo");

    // Build query
    let query = {};

    // Validate that at least one filter is provided
    if (!fromDate && !toDate && !runNo) {
      return NextResponse.json(
        {
          success: false,
          message: "At least one filter (Run Number or Date Range) is required",
        },
        { status: 400 }
      );
    }

    // Date range filter (optional, but both must be provided if using dates)
    if (fromDate || toDate) {
      if (!fromDate || !toDate) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Both From and To dates are required when using date filter",
          },
          { status: 400 }
        );
      }
      query.date = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }
    // Run number filter (optional)
    if (runNo && runNo.trim() !== "") {
      query.runNo = { $regex: runNo.trim(), $options: "i" };
    }

    // Fetch data from RunEntry
    const runEntries = await RunEntry.find(query).lean();

    // Fetch data from Bagging
    const baggingEntries = await Bagging.find(query).lean();

    // Create a map to merge data by runNo
    const dataMap = new Map();

    // Process RunEntry data
    runEntries.forEach((run) => {
      dataMap.set(run.runNo, {
        runNo: run.runNo,
        sector: run.sector || "",
        date: run.date ? new Date(run.date).toISOString().split("T")[0] : "",
        flight: run.flight || "",
        flightNo: run.flightnumber || "",
        counterPart: run.counterpart || "",
        obc: run.obc || "",
        almawb: run.almawb || "",
        runWt: 0,
        masterWt: 0,
        diffWt: 0,
      });
    });

    // Process Bagging data and merge
    baggingEntries.forEach((bag) => {
      if (dataMap.has(bag.runNo)) {
        const existing = dataMap.get(bag.runNo);
        existing.runWt += bag.runWeight || 0;
        existing.masterWt += bag.totalWeight || 0;
      } else {
        // If run not in RunEntry, create from Bagging data
        dataMap.set(bag.runNo, {
          runNo: bag.runNo,
          sector: bag.sector || "",
          date: bag.date ? new Date(bag.date).toISOString().split("T")[0] : "",
          flight: bag.flight || "",
          flightNo: "",
          counterPart: bag.counterPart || "",
          obc: bag.obc || "",
          almawb: bag.alMawb || bag.Mawb || "",
          runWt: bag.runWeight || 0,
          masterWt: 0,
          diffWt: 0,
        });
      }
    });

    // Calculate diff weight and convert to array
    const reportData = Array.from(dataMap.values()).map((item) => ({
      ...item,
      //   diffWt: item.masterWt - item.runWt,
    }));

    // Sort by date (newest first)
    reportData.sort((a, b) => new Date(b.date) - new Date(a.date));

    return NextResponse.json({
      success: true,
      data: reportData,
      count: reportData.length,
    });
  } catch (error) {
    console.error("Error fetching run number report:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch report data",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
