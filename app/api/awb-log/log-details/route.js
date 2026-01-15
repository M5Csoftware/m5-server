import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import LogDetail from "@/app/model/LogDetail";
import Shipment from "@/app/model/portal/Shipment";
import DigitalTally from "@/app/model/DigitalTally";

connectDB();

const errorResponse = (message, status) =>
  NextResponse.json({ error: message }, { status });

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const awbNo = searchParams.get("awbNo");

    if (!awbNo) return errorResponse("awbNo is required", 400);

    console.log("🔍 Fetching log details for AWB:", awbNo);

    // Try to get data from LogDetail collection first
    const logDetail = await LogDetail.findOne({ awbNo }).lean();

    // ✅ FIX: Search DigitalTally by mawbNumber (which stores AWB numbers)
    // Also handle the case where mawbNumber might be in the baggingTable array
    const digitalTally = await DigitalTally.findOne({
      $or: [{ mawbNumber: awbNo }, { "baggingTable.awbNo": awbNo }],
    })
      .sort({ createdAt: -1 }) // Get the most recent entry
      .lean();

    console.log("📦 DigitalTally result:", digitalTally);

    // Also try to get data from Shipment collection as fallback or additional data
    const shipment = await Shipment.findOne({ awbNo }).lean();

    if (!logDetail && !shipment) {
      return errorResponse(`No log details found for awbNo: ${awbNo}`, 404);
    }

    // Merge data from both collections, prioritizing logDetail
    const responseData = {
      // From LogDetail or Shipment
      awbNo: awbNo,

      // Date fields
      shipmentDate: shipment?.date || shipment?.createdAt || "",
      logDate: logDetail?.logDate || shipment?.updatedAt || "",

      // Location fields
      originCode: logDetail?.originCode || shipment?.origin || "",
      sector: logDetail?.sector || shipment?.sector || "",
      destination: logDetail?.destination || shipment?.destination || "",

      // Customer fields
      accountCode: logDetail?.accountCode || shipment?.accountCode || "",
      customerName: logDetail?.customerName || shipment?.customer || "",

      // Consignee fields from Shipment
      receiverFullName: shipment?.receiverFullName || "",

      // Forwarder fields
      forwarder: shipment?.forwarder || "",
      forwardingNo: shipment?.forwardingNo || "",

      // Weight fields
      totalActualWt: shipment?.totalActualWt || 0,
      volumeWt: shipment?.totalVolWt || 0,
      chargeableWt: shipment?.chargeableWt || 0,
      pcs: shipment?.pcs || 0,

      // Hold fields
      isHold: shipment?.isHold || false,
      holdReason: shipment?.holdReason || shipment?.otherHoldReason || "",

      // ✅ FIX: Get inscanUser and inscanUserName from DigitalTally
      inscanUser: digitalTally?.inscanUser || "",
      inscanUserName: digitalTally?.inscanUserName || "",

      // User fields
      shipmentInscanUser: shipment?.insertUser || "",
      lastUser: shipment?.updateUser || "",
    };

    console.log("✅ Response data:", responseData);

    // Return as array to match frontend expectation
    return NextResponse.json([responseData], { status: 200 });
  } catch (err) {
    console.error("Error fetching Log Details:", err);
    return errorResponse("Internal server error", 500);
  }
}
