import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");

    console.log("Received AWB request:", awbNo);

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400 }
      );
    }

    // Fetch shipment data - try both with and without trimming/case sensitivity
    let shipment = await Shipment.findOne({ awbNo: awbNo });
    
    // If not found, try case-insensitive search
    if (!shipment) {
      shipment = await Shipment.findOne({ 
        awbNo: { $regex: new RegExp(`^${awbNo}$`, 'i') } 
      });
    }

    console.log("Shipment found:", shipment ? "Yes" : "No");

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found" },
        { status: 404 }
      );
    }

    // Extract required fields from shipment
    const accountCode = shipment.accountCode;
    const consignorName = shipment.shipperFullName || shipment.shipperName || "";
    const consigneeName = shipment.receiverFullName || shipment.receiverName || "";

    console.log("Account Code:", accountCode);
    console.log("Consignor Name:", consignorName);
    console.log("Consignee Name:", consigneeName);

    // Fetch customer account data
    let customerData = null;
    if (accountCode) {
      customerData = await CustomerAccount.findOne({ 
        accountCode: accountCode 
      });
      
      // If not found, try case-insensitive search
      if (!customerData) {
        customerData = await CustomerAccount.findOne({ 
          accountCode: { $regex: new RegExp(`^${accountCode}$`, 'i') } 
        });
      }
      
      console.log("Customer Data found:", customerData ? "Yes" : "No");
    }

    // Prepare response data
    const responseData = {
      awbNo: shipment.awbNo,
      accountCode: accountCode || "",
      customerName: customerData?.name || "",
      email: customerData?.email || "",
      consignorName: consignorName,
      consigneeName: consigneeName,
    };

    console.log("Sending response:", responseData);

    return NextResponse.json(
      {
        success: true,
        data: responseData,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching RTO shipment data:", error);
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