// app/api/offload-shipment/awb-wise/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400 }
      );
    }

    // Check if AWB exists in Shipment DB
    const shipment = await Shipment.findOne({ awbNo: awbNo });

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "AWB Number not found in shipment database" },
        { status: 404 }
      );
    }

    // Check if the shipment has a runNo (is bagged)
    if (!shipment.runNo || shipment.runNo.trim() === "") {
      return NextResponse.json(
        { 
          success: false, 
          message: "AWB is not bagged yet. Cannot offload unbagged shipments." 
        },
        { status: 400 }
      );
    }

    // Get accountCode from shipment
    const accountCode = shipment.accountCode;

    // Fetch customer details using accountCode
    const customer = await CustomerAccount.findOne({ accountCode: accountCode });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer account not found" },
        { status: 404 }
      );
    }

    // Return the required data
    return NextResponse.json({
      success: true,
      data: {
        awbNo: awbNo,
        accountCode: accountCode,
        customerName: customer.customerName || customer.name || "",
        email: customer.email || "",
        runNo: shipment.runNo, // Include runNo in response
      },
    });
  } catch (error) {
    console.error("Error fetching AWB details:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error", error: error.message },
      { status: 500 }
    );
  }
}