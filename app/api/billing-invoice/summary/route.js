import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function POST(req) {
  try {
    await connectDB();
    const { accountCode, from, to } = await req.json();

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Missing accountCode" },
        { status: 400 }
      );
    }

    // ✅ Build query object
    const query = {
      accountCode,
      billingLocked: true,
      isBilled: { $ne: true },
    };

    // 🔥 FIX: Use 'date' field instead of 'shipmentDate'
    if (from && to) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0); // Start of day

      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999); // End of day

      query.$or = [
        { date: { $gte: fromDate, $lte: toDate } },
        { createdAt: { $gte: fromDate, $lte: toDate } },
      ];
    }

    console.log("🔍 Query:", JSON.stringify(query, null, 2));

    const shipments = await Shipment.find(query);

    console.log(
      `✅ Found ${shipments.length} shipments for accountCode: ${accountCode}`
    );

    if (!shipments.length) {
      return NextResponse.json({
        success: true,
        shipments: [],
        summary: {
          totalAwb: 0,
          basicAmount: 0,
          discountAmount: 0,
          miscAmount: 0,
          fuelAmount: 0,
          taxableAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          grandTotal: 0,
          roundOff: 0,
        },
      });
    }

    let totalAwb = shipments.length;
    let basicAmount = 0;
    let discountAmount = 0;
    let miscAmount = 0;
    let fuelAmount = 0;
    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    shipments.forEach((s) => {
      basicAmount += s.basicAmt || 0;
      discountAmount += s.discountAmt || 0;
      miscAmount += s.miscChg || 0;
      fuelAmount += s.fuelAmt || 0;
      cgstAmount += s.cgst || 0;
      sgstAmount += s.sgst || 0;
      igstAmount += s.igst || 0;
      taxableAmount += s.totalAmt || 0;
    });

    let grandTotal =
      basicAmount -
      discountAmount +
      miscAmount +
      fuelAmount +
      cgstAmount +
      sgstAmount +
      igstAmount;

    const roundOff = Number((Math.round(grandTotal) - grandTotal).toFixed(2));
    grandTotal = Math.round(grandTotal);

    return NextResponse.json({
      success: true,
      shipments,
      summary: {
        totalAwb,
        basicAmount,
        discountAmount,
        miscAmount,
        fuelAmount,
        taxableAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        grandTotal,
        roundOff,
      },
    });
  } catch (error) {
    console.error("❌ Summary API Error:", error);
    return NextResponse.json(
      { success: false, message: "Server error", error: error.message },
      { status: 500 }
    );
  }
}
