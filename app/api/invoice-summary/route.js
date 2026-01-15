import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Invoice from "@/app/model/Invoice";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const branch = searchParams.get("branch");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const accountCode = searchParams.get("accountCode");

    // If no parameters, return branches list
    if (!branch && !fromDate && !toDate && !accountCode) {
      const branches = await Invoice.distinct("branch");
      return NextResponse.json({
        success: true,
        data: branches.filter(Boolean).sort(),
      });
    }

    // Build query for invoice summary
    const query = {};

    if (branch && branch !== "all") {
      query.branch = branch;
    }

    if (fromDate && toDate) {
      query.invoiceDate = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    if (accountCode) {
      query["customer.accountCode"] = accountCode;
    }

    // Fetch invoices
    const invoices = await Invoice.find(query)
      .sort({ invoiceSrNo: 1 })
      .lean();

    // Transform data for frontend
    const transformedData = invoices.map((invoice, index) => ({
      srNo: index + 1,
      invoiceNo: invoice.invoiceNumber || "",
      invoiceDate: invoice.invoiceDate
        ? new Date(invoice.invoiceDate).toLocaleDateString("en-GB")
        : "",
      customerCode: invoice.customer?.accountCode || "",
      customerName: invoice.customer?.name || "",
      gstNo: invoice.customer?.gstNo || "",
      branch: invoice.branch || "",
      salePerson: invoice.createdBy || "",
      fromDate: invoice.fromDate
        ? new Date(invoice.fromDate).toLocaleDateString("en-GB")
        : "",
      toDate: invoice.toDate
        ? new Date(invoice.toDate).toLocaleDateString("en-GB")
        : "",
      nonTaxable: invoice.invoiceSummary?.nonTaxableAmount?.toFixed(2) || "0.00",
      basicAmount: invoice.invoiceSummary?.basicAmount?.toFixed(2) || "0.00",
      miscAmount: invoice.invoiceSummary?.miscChg?.toFixed(2) || "0.00",
      fuel: invoice.invoiceSummary?.fuelChg?.toFixed(2) || "0.00",
      taxable: (
        (invoice.invoiceSummary?.basicAmount || 0) +
        (invoice.invoiceSummary?.miscChg || 0) +
        (invoice.invoiceSummary?.fuelChg || 0)
      ).toFixed(2),
      sgst: invoice.invoiceSummary?.sgst?.toFixed(2) || "0.00",
      cgst: invoice.invoiceSummary?.cgst?.toFixed(2) || "0.00",
      igst: invoice.invoiceSummary?.igst?.toFixed(2) || "0.00",
      grandTotal: invoice.invoiceSummary?.grandTotal?.toFixed(2) || "0.00",
      irn: invoice.qrCodeData?.[0]?.irnNumber || "",
    }));

    return NextResponse.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
    });
  } catch (error) {
    console.error("Error fetching invoice summary:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch invoice summary",
        error: error.message,
      },
      { status: 500 }
    );
  }
}