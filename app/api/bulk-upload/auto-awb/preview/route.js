// File: app/api/auto-awb/preview/route.js

import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

/**
 * Helper function to extract AWB pattern and number
 * Example: "MPL1111113" => { prefix: "MPL", number: 1111113 }
 */
function parseAwbNumber(awbNo) {
  if (!awbNo) return null;
  
  const match = awbNo.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  
  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
    fullAwb: awbNo
  };
}

/**
 * Generate next AWB number based on pattern
 */
function generateNextAwb(prefix, lastNumber, count = 1) {
  const awbs = [];
  for (let i = 0; i < count; i++) {
    const nextNumber = lastNumber + i + 1;
    const awb = `${prefix}${nextNumber}`;
    awbs.push({
      awbNo: awb,
      pattern: prefix,
      number: nextNumber
    });
  }
  return awbs;
}

/**
 * Get the latest AWB number for a given prefix
 */
async function getLatestAwbForPrefix(prefix) {
  try {
    const latestShipment = await Shipment.findOne({
      awbNo: { $regex: `^${prefix}\\d+$` }
    })
    .sort({ awbNo: -1 })
    .select("awbNo")
    .lean();
    
    if (!latestShipment) {
      return null;
    }
    
    return parseAwbNumber(latestShipment.awbNo);
  } catch (error) {
    console.error("Error finding latest AWB:", error);
    return null;
  }
}

/**
 * POST /api/auto-awb/preview
 * Preview AWB assignments without saving to database
 */
export async function POST(request) {
  try {
    await connectDB();

    const { shipments, flightDate, csbChecked } = await request.json();

    console.log("Preview request received:", {
      totalShipments: shipments?.length,
      flightDate,
      csbChecked,
    });

    // Validate input
    if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments data provided" },
        { status: 400 }
      );
    }

    if (!flightDate) {
      return NextResponse.json(
        { success: false, message: "Flight date is required" },
        { status: 400 }
      );
    }

    // Determine AWB prefix - customize this based on your business logic
    const awbPrefix = "MPL";
    
    // Get the latest AWB number for this prefix
    const latestAwb = await getLatestAwbForPrefix(awbPrefix);
    
    let startingNumber;
    if (latestAwb) {
      startingNumber = latestAwb.number;
      console.log(`Latest AWB: ${latestAwb.fullAwb}, next will be ${startingNumber + 1}`);
    } else {
      startingNumber = 1000000;
      console.log(`No AWBs found, starting from ${awbPrefix}${startingNumber + 1}`);
    }

    // Generate AWB numbers for all shipments
    const generatedAwbs = generateNextAwb(awbPrefix, startingNumber, shipments.length);
    
    // Assign AWB numbers to shipments
    const shipmentsWithAwb = shipments.map((shipment, index) => ({
      ...shipment,
      awbNo: generatedAwbs[index].awbNo,
      flight: flightDate,
      csb: csbChecked,
    }));

    return NextResponse.json({
      success: true,
      message: "AWB numbers generated successfully",
      assignedShipments: shipmentsWithAwb,
      awbInfo: {
        pattern: awbPrefix,
        startingAwb: generatedAwbs[0].awbNo,
        endingAwb: generatedAwbs[generatedAwbs.length - 1].awbNo,
        totalAssigned: generatedAwbs.length,
        latestExisting: latestAwb ? latestAwb.fullAwb : "None",
      }
    });

  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error generating AWB preview",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auto-awb/preview?prefix=MPL&count=5
 * Get preview of next available AWB numbers
 */
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix") || "MPL";
    const count = parseInt(searchParams.get("count") || "1", 10);

    const latestAwb = await getLatestAwbForPrefix(prefix);

    if (!latestAwb) {
      const startNumber = 1000001;
      const generatedAwbs = generateNextAwb(prefix, startNumber - 1, count);
      
      return NextResponse.json({
        success: true,
        message: `No existing AWBs found for prefix ${prefix}`,
        nextAwbs: generatedAwbs.map(a => a.awbNo),
        prefix: prefix,
        startingNumber: startNumber,
      });
    }

    const generatedAwbs = generateNextAwb(prefix, latestAwb.number, count);

    return NextResponse.json({
      success: true,
      message: `Next AWB numbers generated`,
      latestAwb: latestAwb.fullAwb,
      nextAwbs: generatedAwbs.map(a => a.awbNo),
      prefix: prefix,
      currentNumber: latestAwb.number,
      nextNumber: latestAwb.number + 1,
    });
  } catch (error) {
    console.error("Get preview error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error getting AWB preview",
        error: error.message,
      },
      { status: 500 }
    );
  }
}