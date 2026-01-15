import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import Invoice from "@/app/model/Invoice";
import Bagging from "@/app/model/bagging";
import RunEntry from "@/app/model/RunEntry";
import mongoose from "mongoose";

// GET /api/billing-data
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // Format: "2025-01" for January 2025
    const type = searchParams.get("type"); // "billing", "invoice", "shipments", or "runs"

    if (!month || !type) {
      return NextResponse.json(
        { error: "Month and type parameters are required" },
        { status: 400 }
      );
    }

    // Parse the month to get start and end dates
    const [year, monthNum] = month.split("-");
    const startDate = new Date(year, parseInt(monthNum) - 1, 1);
    const endDate = new Date(year, parseInt(monthNum), 0, 23, 59, 59);

    if (type === "billing") {
      // Fetch billing summary data
      const billingData = await Shipment.aggregate([
        {
          $match: {
            runDate: {
              $gte: startDate,
              $lte: endDate,
            },
            runNo: { $ne: "" },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$runDate" } },
              runNo: "$runNo",
            },
            totalAwb: { $sum: 1 },
            unbilledAwb: {
              $sum: {
                $cond: [{ $eq: ["$billingLocked", false] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            date: "$_id.date",
            runNo: "$_id.runNo",
            totalAwb: 1,
            unbilledAwb: 1,
          },
        },
        {
          $sort: { date: -1, runNo: 1 },
        },
      ]);

      return NextResponse.json({
        success: true,
        data: billingData,
      });
    } else if (type === "invoice") {
      // Fetch invoice summary data
      const invoiceData = await Invoice.aggregate([
        {
          $match: {
            invoiceDate: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $lookup: {
            from: "shipments",
            let: { awbNumbers: "$shipments.awbNo" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$awbNo", "$$awbNumbers"] },
                },
              },
              {
                $project: {
                  awbNo: 1,
                  isBilled: 1,
                },
              },
            ],
            as: "shipmentDetails",
          },
        },
        {
          $project: {
            _id: 0,
            customerName: "$customer.name",
            invoiceNo: "$invoiceNumber",
            isBilled: {
              $allElementsTrue: {
                $map: {
                  input: "$shipmentDetails",
                  as: "shipment",
                  in: "$$shipment.isBilled",
                },
              },
            },
          },
        },
        {
          $project: {
            customerName: 1,
            invoiceNo: 1,
            status: {
              $cond: {
                if: "$isBilled",
                then: "Completed",
                else: "Pending",
              },
            },
          },
        },
        {
          $sort: { invoiceNo: -1 },
        },
      ]);

      return NextResponse.json({
        success: true,
        data: invoiceData,
      });
    } else if (type === "shipments") {
      // Fetch shipments summary data for a specific date
      const date = searchParams.get("date"); // Format: "2025-01-15"
      
      if (!date) {
        return NextResponse.json(
          { error: "Date parameter is required for shipments type" },
          { status: 400 }
        );
      }

      const selectedDate = new Date(date);
      const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));

      // Get departed shipments data from Bagging collection
      const baggingData = await Bagging.aggregate([
        {
          $match: {
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            runNo: { $ne: "" },
          },
        },
        {
          $group: {
            _id: null,
            noOfAwb: { $sum: "$noOfAwb" },
            runWeight: { $sum: "$runWeight" },
          },
        },
        {
          $project: {
            _id: 0,
            noOfAwb: 1,
            runWeight: { $round: ["$runWeight", 2] },
          },
        },
      ]);

      const result = baggingData.length > 0 
        ? baggingData[0] 
        : { noOfAwb: 0, runWeight: 0 };

      return NextResponse.json({
        success: true,
        data: result,
      });
    } else if (type === "runs") {
      // Fetch runs data where accountType is hub or hubAirport
      const date = searchParams.get("date"); // Format: "2025-01-15"
      
      if (!date) {
        return NextResponse.json(
          { error: "Date parameter is required for runs type" },
          { status: 400 }
        );
      }

      const selectedDate = new Date(date);
      const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));

      // Get runs where accountType is hub or hubAirport from RunEntry collection
      const runsData = await RunEntry.aggregate([
        {
          $match: {
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            accountType: { $in: ["hub", "hubAirport"] },
          },
        },
        {
          $lookup: {
            from: "baggings",
            localField: "runNo",
            foreignField: "runNo",
            as: "baggingData",
          },
        },
        {
          $unwind: {
            path: "$baggingData",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: null,
            totalRuns: { $sum: 1 },
            totalRunWeight: { $sum: { $ifNull: ["$baggingData.runWeight", 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            totalRuns: 1,
            totalRunWeight: { $round: ["$totalRunWeight", 2] },
          },
        },
      ]);

      const result = runsData.length > 0 
        ? runsData[0] 
        : { totalRuns: 0, totalRunWeight: 0 };

      return NextResponse.json({
        success: true,
        data: result,
      });
    } else if (type === "runs-export") {
      // Export runs data to Excel
      const date = searchParams.get("date"); // Format: "2025-01-15"
      
      if (!date) {
        return NextResponse.json(
          { error: "Date parameter is required for runs export" },
          { status: 400 }
        );
      }

      const selectedDate = new Date(date);
      const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));

      // Get runs where accountType is hub or hubAirport with detailed bagging info
      const runsExportData = await RunEntry.aggregate([
        {
          $match: {
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            accountType: { $in: ["hub", "hubAirport"] },
          },
        },
        {
          $lookup: {
            from: "baggings",
            localField: "runNo",
            foreignField: "runNo",
            as: "baggingData",
          },
        },
        {
          $unwind: {
            path: "$baggingData",
            preserveNullAndEmptyArrays: false,
          },
        },
        {
          $project: {
            _id: 0,
            runNo: "$runNo",
            date: "$date",
            sector: "$baggingData.sector",
            flight: "$baggingData.flight",
            mawb: "$baggingData.alMawb",
            countBag: "$baggingData.noOfBags",
            totalAWB: "$baggingData.noOfAwb",
            runWeight: "$baggingData.runWeight",
          },
        },
        {
          $sort: { runNo: 1 },
        },
      ]);

      return NextResponse.json({
        success: true,
        data: runsExportData,
      });
    } else {
      return NextResponse.json(
        { error: "Invalid type parameter. Must be 'billing', 'invoice', 'shipments', 'runs', or 'runs-export'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error fetching billing data:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing data", details: error.message },
      { status: 500 }
    );
  }
}