// app/api/clubbing/validate-awb/route.js
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const awbNo = searchParams.get("awbNo");

    console.log(`Validating AWB for clubbing: ${awbNo}`);

    if (!awbNo?.trim()) {
      return NextResponse.json(
        {
          isValid: false,
          clubNo: null,
          completeDataLock: false,
          message: "AWB Number is required",
        },
        { status: 400 }
      );
    }

    // Query the shipment collection for this AWB
    const shipment = await Shipment.findOne({
      awbNo: awbNo.trim(),
    });

    console.log(`Shipment found:`, shipment);

    // If shipment doesn't exist
    if (!shipment) {
      console.log(`AWB ${awbNo} not found in shipments`);
      return NextResponse.json(
        {
          isValid: false,
          clubNo: null,
          completeDataLock: false,
          message: `AWB ${awbNo.trim()} not found in shipments`,
        },
        { status: 200 }
      );
    }

    if (shipment.payment === "RTO") {
      return NextResponse.json({
        isValid: false,
        clubNo: null,
        completeDataLock: false,
        payment: "RTO",
        message: "This shipment is RTO and cannot be clubbed",
      });
    }

    // CHECK 1: completeDataLock
    if (shipment.completeDataLock === true) {
      console.log(`AWB ${awbNo} is locked (completeDataLock=true)`);
      return NextResponse.json(
        {
          isValid: false,
          clubNo: shipment.clubNo || null,
          completeDataLock: true,
          message: `AWB ${awbNo.trim()} is locked and cannot be clubbed`,
        },
        { status: 200 }
      );
    }

    // CHECK 2: Already clubbed
    const hasClubNo =
      shipment.clubNo &&
      shipment.clubNo !== null &&
      shipment.clubNo.toString().trim() !== "";

    if (hasClubNo) {
      console.log(`AWB ${awbNo} is already clubbed in Club ${shipment.clubNo}`);
      return NextResponse.json(
        {
          isValid: false,
          clubNo: shipment.clubNo,
          completeDataLock: false,
          message: `AWB ${awbNo.trim()} is already clubbed in Club ${
            shipment.clubNo
          }`,
        },
        { status: 200 }
      );
    }

    // AWB is valid for clubbing
    console.log(`AWB ${awbNo} is available for clubbing`);
    return NextResponse.json(
      {
        isValid: true,
        clubNo: null,
        completeDataLock: false,
        message: "AWB is available for clubbing",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error validating AWB:", error);
    return NextResponse.json(
      {
        isValid: false,
        clubNo: null,
        completeDataLock: false,
        message: "Error validating AWB",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
