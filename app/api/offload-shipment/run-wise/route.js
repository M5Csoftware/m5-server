// app/api/offload-shipment/run-wise/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return NextResponse.json(
        { success: false, message: "Run Number is required" },
        { status: 400 }
      );
    }

    // Find all shipments with the given runNo
    const shipments = await Shipment.find({ runNo: runNo });

    if (!shipments || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments found for this Run Number" },
        { status: 404 }
      );
    }

    // Get unique account codes from shipments
    const accountCodes = [...new Set(shipments.map((s) => s.accountCode))];

    // Fetch customer details for all account codes
    const customers = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    });

    // Create a map for quick customer lookup
    const customerMap = {};
    customers.forEach((customer) => {
      customerMap[customer.accountCode] = {
        customerName: customer.customerName || customer.name || "",
        email: customer.email || "",
      };
    });

    // Build response data
    const shipmentsData = shipments.map((shipment) => {
      const customerInfo = customerMap[shipment.accountCode] || {
        customerName: "",
        email: "",
      };

      return {
        awbNo: shipment.awbNo,
        accountCode: shipment.accountCode,
        customerName: customerInfo.customerName,
        email: customerInfo.email,
        runNo: shipment.runNo,
      };
    });

    return NextResponse.json({
      success: true,
      data: shipmentsData,
      count: shipmentsData.length,
    });
  } catch (error) {
    console.error("Error fetching Run details:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error", error: error.message },
      { status: 500 }
    );
  }
}