import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const awb = searchParams.get("awb");

    if (!awb) {
      return NextResponse.json(
        { message: "AWB number required" },
        { status: 400 }
      );
    }

    // Find shipment by awbNo (case-insensitive)
    const shipment = await Shipment.findOne({
      awbNo: { $regex: `^${awb}$`, $options: "i" },
    });

    if (!shipment) {
      return NextResponse.json(
        { message: "Shipment not found" },
        { status: 404 }
      );
    }

    // Build response to fit InvoiceCsbV structure
    const invoiceData = {
      invoiceNo: shipment.billNo || `INV-${shipment.awbNo}`,
      invoiceDate: new Date(shipment.date).toLocaleDateString("en-GB"),
      airwayBillNumber: shipment.awbNo,
      dateOfSupply: new Date(shipment.date).toLocaleDateString("en-GB"),
      placeOfSupply: shipment.receiverState || "N/A",
      stateCode: shipment.receiverPincode?.slice(0, 2) || "NA",
      igstStatus: "UT",
      currency: "USD",

      billTo: {
        name: shipment.shipperFullName,
        address1: shipment.shipperAddressLine1,
        address2: shipment.shipperAddressLine2,
        city: shipment.shipperCity,
        pincode: shipment.shipperPincode,
        country: shipment.shipperCountry,
        email: shipment.shipperEmail,
      },
      shipTo: {
        name: shipment.receiverFullName,
        address1: shipment.receiverAddressLine1,
        address2: shipment.receiverAddressLine2,
        city: shipment.receiverCity,
        pincode: shipment.receiverPincode,
        country: shipment.receiverCountry,
        email: shipment.receiverEmail,
      },

      // build item list from shipmentAndPackageDetails
      items: Object.entries(shipment.shipmentAndPackageDetails || {}).flatMap(
        ([boxNo, details]) =>
          details.map((item) => ({
            description:
              item.itemName || item.description || item.context || "Unknown",
            hsn: item.hsn || item.hsnNo || "",
            qty: item.quantity || item.qty || 0,
            rate: item.rate || 0,
            amount: item.amount || 0,
            taxableValue: item.amount || 0,
            igst: 0,
            total: item.amount || 0,
          }))
      ),

      totalAmount:
        Object.entries(shipment.shipmentAndPackageDetails || {})
          .flatMap(([_, details]) => details.map((i) => Number(i.amount || 0)))
          .reduce((sum, val) => sum + val, 0) || 0,

      igstAmount: 0,
    };

    return NextResponse.json(invoiceData, { status: 200 });
  } catch (err) {
    console.error("Error fetching invoice:", err);
    return NextResponse.json(
      { message: "Server error", error: err.message },
      { status: 500 }
    );
  }
}
