import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { fields } = body;

    if (!fields || fields.length === 0) {
      return Response.json(
        { success: false, message: "No fields selected" },
        { status: 400 }
      );
    }

    // UI → DB field map
    const fieldMap = {
      // Shipment Info
      "AWB Number": "awbNo",
      "Reference Number": "reference",
      "Booking Date": "date",
      "Shipment Type": "shipmentType",
      Mode: "service",
      Sector: "sector",

      // Consignor
      "Consignor Name": "shipperFullName",
      "Consignor Address": "shipperAddressLine1",
      "Consignor City": "shipperCity",
      "Consignor State": "shipperState",
      "Consignor Contact": "shipperPhoneNumber",
      "Consignor Email": "shipperEmail",
      "KYC Type": "shipperKycType",
      "KYC Number": "shipperKycNumber",

      // Consignee
      "Consignee Name": "receiverFullName",
      "Consignee Address": "receiverAddressLine1",
      "Consignee City": "receiverCity",
      "Consignee Country": "receiverCountry",
      "Consignee Contact": "receiverPhoneNumber",
      "Consignee Email": "receiverEmail",

      // Weights
      "Actual Weight": "totalActualWt",
      "Chargeable Weight": "chargeableWt",
      Length: "length",
      Width: "width",
      Height: "height",

      // Account Info
      "Account Code": "accountCode",
      "Account Type": "accountType",

      // Staff
      "Booked By": "insertUser",
      Branch: "origin",
    };

    // Convert UI labels → mongoose fields
    const projection = {};
    fields.forEach((f) => {
      if (fieldMap[f]) projection[fieldMap[f]] = 1;
    });

    // Always send AWB number as identifier
    projection["awbNo"] = 1;

    const shipments = await Shipment.find({}, projection).lean();

    return Response.json({
      success: true,
      fields,
      projection,
      data: shipments,
    });
  } catch (err) {
    console.error("Filter API error:", err);
    return Response.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}