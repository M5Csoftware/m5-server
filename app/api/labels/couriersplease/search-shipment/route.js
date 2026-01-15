// app/api/couriersplease/search-shipment/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

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

    // Find shipment by AWB Number
    const shipment = await Shipment.findOne({ awbNo });

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found" },
        { status: 404 }
      );
    }

    // Fetch customer details if accountCode exists
    let customerName = "";
    if (shipment.accountCode) {
      const customer = await CustomerAccount.findOne({
        accountCode: shipment.accountCode,
      });
      customerName = customer ? customer.name : "";
    }

    // Prepare response data
    const responseData = {
      awbNo: shipment.awbNo,
      accountCode: shipment.accountCode,
      customer: customerName,
      sector: shipment.sector,
      date: shipment.createdAt,
      origin: shipment.origin,
      destination: shipment.destination,

      // Consignor (Shipper) Details
      shipperFullName: shipment.shipperFullName,
      shipperPhoneNumber: shipment.shipperPhoneNumber,
      shipperEmail: shipment.shipperEmail,
      shipperAddressLine1: shipment.shipperAddressLine1,
      shipperAddressLine2: shipment.shipperAddressLine2,
      shipperCity: shipment.shipperCity,
      shipperState: shipment.shipperState,
      shipperCountry: shipment.shipperCountry,
      shipperPincode: shipment.shipperPincode,

      // Consignee (Receiver) Details
      receiverFullName: shipment.receiverFullName,
      receiverPhoneNumber: shipment.receiverPhoneNumber,
      receiverEmail: shipment.receiverEmail,
      receiverAddressLine1: shipment.receiverAddressLine1,
      receiverAddressLine2: shipment.receiverAddressLine2,
      receiverCity: shipment.receiverCity,
      receiverState: shipment.receiverState,
      receiverCountry: shipment.receiverCountry,
      receiverPincode: shipment.receiverPincode,

      // Service Details
      pcs: shipment.pcs,
      totalActualWt: shipment.totalActualWt,
      totalInvoiceValue: shipment.totalInvoiceValue,
      operationRemark: shipment.operationRemark,
      content: shipment.content,

      // Hold Information
      isHold: shipment.isHold,
      holdReason: shipment.holdReason,
      otherHoldReason: shipment.otherHoldReason,

      // Package Details
      shipmentAndPackageDetails: shipment.shipmentAndPackageDetails,
    };

    return NextResponse.json(
      {
        success: true,
        message: "Shipment found successfully",
        data: responseData,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Search shipment error:", error);
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
