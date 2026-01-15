import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Invoice from "@/app/model/Invoice";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const invoiceNumber = searchParams.get("invoiceNumber");

    if (invoiceNumber) {
      console.log("🔍 Searching for specific invoice:", invoiceNumber);

      const invoice = await Invoice.findOne({ invoiceNumber });

      if (!invoice) {
        console.log("❌ Invoice not found:", invoiceNumber);

        const samples = await Invoice.find({}, "invoiceNumber").limit(5);
        console.log(
          "📋 Sample invoices:",
          samples.map((i) => i.invoiceNumber)
        );

        return NextResponse.json(
          {
            success: false,
            message: `Invoice not found: ${invoiceNumber}`,
          },
          { status: 404 }
        );
      }

      // ✅ invoice exists, now merge
      const awbList = (invoice.shipments || [])
        .map((s) => s.awbNo)
        .filter(Boolean);

      const detailedShipments = awbList.length
        ? await Shipment.find({ awbNo: { $in: awbList } }).lean()
        : [];

      const detailByAwb = detailedShipments.reduce((acc, s) => {
        acc[s.awbNo] = s;
        return acc;
      }, {});

      const mergedShipments = (invoice.shipments || []).map((invShip) => {
        const d = detailByAwb[invShip.awbNo] || {};
        return {
          ...invShip,
          ...d,
          amount: invShip.amount ?? d.basicAmt ?? d.totalAmt ?? 0,
          discount: invShip.discount ?? d.discountAmt ?? d.discount ?? 0,
          taxableAmount:
            invShip.taxableAmount ??
            (d.basicAmt ?? invShip.amount ?? 0) -
              (d.discountAmt ?? invShip.discount ?? 0),
          date: d.date || invShip.date || null,
        };
      });

      console.log("✅ Invoice found:", invoice.invoiceNumber);

      const invoiceObj = invoice.toObject();
      invoiceObj.shipments = mergedShipments;

      return NextResponse.json({
        success: true,
        ...invoiceObj,
      });
    }

    // ✅ Otherwise, listing invoices
    console.log("📋 Fetching all invoices for dropdown");

    const invoices = await Invoice.find(
      {},
      "invoiceNumber branch invoiceDate totalAwb invoiceSummary.grandTotal"
    ).sort({ createdAt: -1 });

    if (!invoices.length) {
      return NextResponse.json({
        success: false,
        message: "No invoices found",
        invoices: [],
        branches: [],
      });
    }

    const uniqueBranches = [
      ...new Set(
        invoices
          .map((i) => i.branch)
          .filter((branch) => branch != null && branch !== "")
      ),
    ];

    return NextResponse.json({
      success: true,
      invoices,
      branches: uniqueBranches,
    });
  } catch (error) {
    console.error("❌ Error fetching invoices:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Server error",
        error: error.message,
        invoices: [],
        branches: [],
      },
      { status: 500 }
    );
  }
}
