import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Invoice from "@/app/model/Invoice";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const branch = searchParams.get("branch");
    const customerCode = searchParams.get("customerCode");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    console.log("📋 Fetching invoices with filters:", {
      branch,
      customerCode,
      fromDate,
      toDate,
    });

    // Build query object
    const query = {};

    // Filter by branch (required)
    if (branch) {
      query.branch = branch;
    }

    // Filter by customer code (optional)
    if (customerCode) {
      query["customer.accountCode"] = customerCode;
    }

    // Filter by date range (required)
    if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      
      // Set time boundaries for accurate comparison
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);

      query.invoiceDate = {
        $gte: from,
        $lte: to,
      };
    }

    console.log("🔍 Query:", JSON.stringify(query, null, 2));

    // Fetch invoices with selected fields
    const invoices = await Invoice.find(query)
      .select(
        "invoiceNumber invoiceDate branch customer invoiceSummary qrCodeData totalAwb shipments"
      )
      .sort({ invoiceDate: -1 })
      .lean();

    console.log(`✅ Found ${invoices.length} invoice(s)`);

    if (invoices.length === 0) {
      return NextResponse.json({
        success: true,
        invoices: [],
        count: 0,
        message: "No invoices found matching the criteria",
      });
    }

    // Format invoices for frontend
    const formattedInvoices = invoices.map((invoice) => ({
      invoiceNo: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      customerCode: invoice.customer?.accountCode || "",
      customerName: invoice.customer?.name || "",
      branch: invoice.branch,
      grandTotal: invoice.invoiceSummary?.grandTotal || 0,
      // Keep full invoice data for email sending
      _fullData: invoice,
    }));

    return NextResponse.json({
      success: true,
      invoices: formattedInvoices,
      count: formattedInvoices.length,
    });
  } catch (error) {
    console.error("❌ Error fetching invoices:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch invoices",
        error: error.message,
        invoices: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}