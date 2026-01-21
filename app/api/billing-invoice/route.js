import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Invoice from "@/app/model/Invoice";
import Shipment from "@/app/model/portal/Shipment";

export async function GET() {
  try {
    await connectDB();

    const latestInvoice = await Invoice.findOne({})
      .sort({ invoiceSrNo: -1 })
      .select("invoiceSrNo");

    const nextSrNo = latestInvoice ? latestInvoice.invoiceSrNo + 1 : 1;

    return NextResponse.json({
      success: true,
      nextSrNo,
    });
  } catch (error) {
    console.error("Error fetching next invoice sr no:", error);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();

    const {
      invoiceSrNo,
      invoiceNumber,
      invoiceDate,
      fromDate,
      toDate,
      branch,
      createdBy,
      customer,
      shipments,
      invoiceSummary,
      placeOfSupply,
      financialYear,
      totalAwb,
    } = body;

    // 🔍 Validate required fields
    if (!invoiceSrNo || !invoiceNumber) {
      return NextResponse.json(
        { success: false, message: "Missing invoiceSrNo or invoiceNumber" },
        { status: 400 },
      );
    }

    // ✅ Construct invoice object
    const newInvoice = {
      invoiceSrNo,
      invoiceNumber,
      invoiceDate,
      fromDate,
      toDate,
      branch,
      createdBy,
      customer,
      shipments,
      invoiceSummary,
      placeOfSupply,
      financialYear,
      totalAwb,
    };

    // 🚫 Validate shipment eligibility before invoicing (removed bagNo validation)
    if (shipments && shipments.length > 0) {
      const awbNos = shipments.map((s) => s.awbNo).filter(Boolean);

      const invalidShipments = await Shipment.find({
        awbNo: { $in: awbNos },
      }).select("awbNo runNo isHold");

      const reasons = [];

      invalidShipments.forEach((s) => {
        if (s.isHold) reasons.push(`Shipment ${s.awbNo} is on Hold`);
        if (!s.runNo) reasons.push(`Shipment ${s.awbNo} - RunNo missing`);
      });

      if (reasons.length > 0) {
        return NextResponse.json(
          {
            success: false,
            message: "Invoice cannot be created",
            reasons,
          },
          { status: 400 },
        );
      }
    }

    // 💾 1️⃣ Save the invoice
    const createdInvoice = await Invoice.create(newInvoice);

    // ✅ 2️⃣ Update shipments to mark as billed
    if (shipments && shipments.length > 0) {
      const awbNos = shipments.map((s) => s.awbNo).filter(Boolean);
      if (awbNos.length > 0) {
        await Shipment.updateMany(
          { awbNo: { $in: awbNos } },
          {
            $set: {
              isBilled: true,
              billingLocked: true,
              billNo: invoiceNumber,
            },
          },
        );
      }
    }

    return NextResponse.json(
      { success: true, invoice: createdInvoice },
      { status: 201 },
    );
  } catch (err) {
    console.error("❌ DB Error:", err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const invoiceNumber = searchParams.get("invoiceNumber");

    if (!invoiceNumber) {
      return NextResponse.json(
        { success: false, message: "Missing invoice number" },
        { status: 400 },
      );
    }

    // Find invoice
    const invoice = await Invoice.findOne({ invoiceNumber });
    if (!invoice) {
      return NextResponse.json(
        { success: false, message: "Invoice not found" },
        { status: 404 },
      );
    }

    // Collect AWB numbers
    const awbNos = invoice.shipments?.map((s) => s.awbNo).filter(Boolean) || [];

    // Update shipments: only these 2 fields
    if (awbNos.length > 0) {
      await Shipment.updateMany(
        { awbNo: { $in: awbNos } },
        {
          $set: {
            isBilled: false,
            billNo: null,
          },
        },
      );
    }

    // Delete invoice
    await Invoice.deleteOne({ invoiceNumber });

    return NextResponse.json({
      success: true,
      message: "Invoice deleted",
    });
  } catch (err) {
    console.error("❌ Delete error:", err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
