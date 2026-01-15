// app/api/overseas-manifest/can/save/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CANData from "@/app/model/CANData";

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { runNo, dataType, data, runInfo, modifiedBy } = body;

    // Validation
    if (!runNo || !runNo.trim()) {
      return NextResponse.json(
        { success: false, message: "Run Number is required" },
        { status: 400 }
      );
    }

    if (!dataType || !["manifest", "invoice"].includes(dataType)) {
      return NextResponse.json(
        { success: false, message: "Invalid data type. Must be 'manifest' or 'invoice'" },
        { status: 400 }
      );
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { success: false, message: "Data array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Find existing document or create new one
    let canData = await CANData.findOne({ runNo, dataType });

    if (canData) {
      // Update existing document
      if (dataType === "manifest") {
        canData.manifestData = data;
      } else if (dataType === "invoice") {
        canData.invoiceData = data;
      }

      canData.runInfo = runInfo || canData.runInfo;
      canData.modifiedBy = modifiedBy || "system";
      canData.isModified = true;
      canData.modificationCount = (canData.modificationCount || 0) + 1;
    } else {
      // Create new document
      canData = new CANData({
        runNo,
        dataType,
        runInfo: runInfo || { runNo, sector: "CAN" },
        modifiedBy: modifiedBy || "system",
        isModified: false,
        modificationCount: 0,
      });

      if (dataType === "manifest") {
        canData.manifestData = data;
      } else if (dataType === "invoice") {
        canData.invoiceData = data;
      }
    }

    await canData.save();

    return NextResponse.json(
      {
        success: true,
        message: `${dataType === "manifest" ? "Manifest" : "Invoice"} data saved successfully`,
        data: {
          runNo: canData.runNo,
          dataType: canData.dataType,
          recordCount: data.length,
          isModified: canData.isModified,
          modificationCount: canData.modificationCount,
          savedAt: canData.updatedAt,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error saving CAN data:", error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "A record with this Run Number and data type already exists",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to save data",
      },
      { status: 500 }
    );
  }
}

// GET route to retrieve saved data
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const runNo = searchParams.get("runNo");
    const dataType = searchParams.get("dataType");

    if (!runNo || !dataType) {
      return NextResponse.json(
        { success: false, message: "Run Number and data type are required" },
        { status: 400 }
      );
    }

    if (!["manifest", "invoice"].includes(dataType)) {
      return NextResponse.json(
        { success: false, message: "Invalid data type" },
        { status: 400 }
      );
    }

    const canData = await CANData.findOne({ runNo, dataType });

    if (!canData) {
      return NextResponse.json(
        { success: false, message: "No saved data found for this Run Number" },
        { status: 404 }
      );
    }

    const responseData =
      dataType === "manifest" ? canData.manifestData : canData.invoiceData;

    return NextResponse.json(
      {
        success: true,
        message: "Data retrieved successfully",
        data: responseData,
        runInfo: canData.runInfo,
        metadata: {
          isModified: canData.isModified,
          modificationCount: canData.modificationCount,
          modifiedBy: canData.modifiedBy,
          lastUpdated: canData.updatedAt,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error retrieving CAN data:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to retrieve data",
      },
      { status: 500 }
    );
  }
}