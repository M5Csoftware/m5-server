import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request) {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET /api/awb-details?awbNo=123456789
export async function GET(request) {
  try {
    console.log("=== AWB Details API Called ===");
    
    await connectDB();
    console.log("Database connected");

    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");

    console.log("Requested AWB Number:", awbNo);

    if (!awbNo) {
      console.log("Validation failed: AWB Number missing");
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Find shipment by AWB number
    console.log("Searching for shipment...");
    const shipment = await Shipment.findOne({ awbNo });

    if (!shipment) {
      console.log("Shipment not found for AWB:", awbNo);
      return NextResponse.json(
        { success: false, message: `AWB Number ${awbNo} not found` },
        { status: 404, headers: corsHeaders }
      );
    }

    console.log("Shipment found:", {
      awbNo: shipment.awbNo,
      accountCode: shipment.accountCode,
    });

    // Get customer details
    console.log("Searching for customer with account code:", shipment.accountCode);
    const customer = await CustomerAccount.findOne({
      accountCode: shipment.accountCode,
    });

    if (!customer) {
      console.log("Customer not found for account code:", shipment.accountCode);
      return NextResponse.json(
        { 
          success: false, 
          message: `Customer account ${shipment.accountCode} not found` 
        },
        { status: 404, headers: corsHeaders }
      );
    }

    console.log("Customer found:", {
      accountCode: customer.accountCode,
      name: customer.name,
    });

    const responseData = {
      success: true,
      data: {
        awbNo: shipment.awbNo,
        accountCode: customer.accountCode,
        customerName: customer.name,
        // Additional useful information
        shipmentDetails: {
          date: shipment.date,
          sector: shipment.sector,
          origin: shipment.origin,
          destination: shipment.destination,
          status: shipment.status,
        },
        customerDetails: {
          email: customer.email,
          telNo: customer.telNo,
          city: customer.city,
          state: customer.state,
        },
      },
    };

    console.log("Sending response:", responseData);

    return NextResponse.json(responseData, { 
      status: 200, 
      headers: corsHeaders 
    });
  } catch (error) {
    console.error("=== AWB Details Error ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to fetch AWB details",
        error: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}