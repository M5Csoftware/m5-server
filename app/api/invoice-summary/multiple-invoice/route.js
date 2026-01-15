import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Invoice from "@/app/model/Invoice";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { invoiceNumbers } = body;

    if (!invoiceNumbers || !Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Invoice numbers are required",
        },
        { status: 400 }
      );
    }

    // Build query to find invoices by invoice numbers
    const query = {
      invoiceNumber: { $in: invoiceNumbers }
    };

    // Fetch invoices
    const invoices = await Invoice.find(query)
      .sort({ invoiceSrNo: 1 })
      .lean();

    if (invoices.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No invoices found",
        data: [],
        count: 0,
      });
    }

    // Get all unique account codes from invoices
    const accountCodes = [
      ...new Set(
        invoices
          .map((inv) => inv.customer?.accountCode)
          .filter(Boolean)
      ),
    ];

    // Fetch GST numbers for all customers in one query
    const customerAccounts = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    })
      .select("accountCode gstNo")
      .lean();

    // Create a map for quick GST lookup
    const gstMap = {};
    customerAccounts.forEach((customer) => {
      gstMap[customer.accountCode] = customer.gstNo || "";
    });

    // Transform data for frontend
    const transformedData = invoices.map((invoice, index) => {
      const customerAccountCode = invoice.customer?.accountCode || "";
      const gstFromCustomerAccount = gstMap[customerAccountCode] || "";
      const gstFromInvoice = invoice.customer?.gstNo || "";

      return {
        srNo: index + 1,
        invoiceNo: invoice.invoiceNumber || "",
        invoiceDate: invoice.invoiceDate
          ? new Date(invoice.invoiceDate).toLocaleDateString("en-GB")
          : "",
        customerCode: customerAccountCode,
        customerName: invoice.customer?.name || "",
        gstNo: gstFromCustomerAccount || gstFromInvoice,
        state: invoice.customer?.state || "",
        salePerson: invoice.createdBy || "",
        fromDate: invoice.fromDate
          ? new Date(invoice.fromDate).toLocaleDateString("en-GB")
          : "",
        toDate: invoice.toDate
          ? new Date(invoice.toDate).toLocaleDateString("en-GB")
          : "",
        basicAmount: invoice.invoiceSummary?.basicAmount?.toFixed(2) || "0.00",
        discount: invoice.invoiceSummary?.discountAmount?.toFixed(2) || "0.00",
        basicAmountAfterDiscount: (
          (invoice.invoiceSummary?.basicAmount || 0) -
          (invoice.invoiceSummary?.discountAmount || 0)
        ).toFixed(2),
        miscAmount: invoice.invoiceSummary?.miscChg?.toFixed(2) || "0.00",
        fuel: invoice.invoiceSummary?.fuelChg?.toFixed(2) || "0.00",
        taxable: (
          (invoice.invoiceSummary?.basicAmount || 0) -
          (invoice.invoiceSummary?.discountAmount || 0) +
          (invoice.invoiceSummary?.miscChg || 0) +
          (invoice.invoiceSummary?.fuelChg || 0)
        ).toFixed(2),
        sgst: invoice.invoiceSummary?.sgst?.toFixed(2) || "0.00",
        cgst: invoice.invoiceSummary?.cgst?.toFixed(2) || "0.00",
        igst: invoice.invoiceSummary?.igst?.toFixed(2) || "0.00",
        nonTaxable: invoice.invoiceSummary?.nonTaxableAmount?.toFixed(2) || "0.00",
        grandTotal: invoice.invoiceSummary?.grandTotal?.toFixed(2) || "0.00",
      };
    });

    return NextResponse.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
    });
  } catch (error) {
    console.error("Error fetching multiple invoice summary:", error);
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