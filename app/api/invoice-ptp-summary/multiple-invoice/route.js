import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import InvoicePTP from "@/app/model/InvoicePTP";
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
      "clientDetails.invoiceSrNo": { $in: invoiceNumbers }
    };

    // Fetch invoices
    const invoices = await InvoicePTP.find(query)
      .sort({ "clientDetails.invoiceSrNo": 1 })
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
          .map((inv) => inv.clientDetails?.accountCode)
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
      const customerAccountCode = invoice.clientDetails?.accountCode || "";
      const gstFromCustomerAccount = gstMap[customerAccountCode] || "";
      const gstFromInvoice = invoice.clientDetails?.gstNo || "";

      return {
        srNo: index + 1,
        invoiceNo: invoice.clientDetails?.invoiceSrNo || "",
        invoiceDate: invoice.clientDetails?.invoiceDate
          ? new Date(invoice.clientDetails.invoiceDate).toLocaleDateString("en-GB")
          : "",
        customerCode: customerAccountCode,
        customerName: invoice.clientDetails?.customerName || "",
        gstNo: gstFromCustomerAccount || gstFromInvoice,
        state: invoice.clientDetails?.state || "",
        fromDate: invoice.clientDetails?.dateFrom
          ? new Date(invoice.clientDetails.dateFrom).toLocaleDateString("en-GB")
          : "",
        toDate: invoice.clientDetails?.dateTo
          ? new Date(invoice.clientDetails.dateTo).toLocaleDateString("en-GB")
          : "",
        airFreight: invoice.amountDetails?.freightAmount?.toFixed(2) || "0.00",
        clearanceCharge: invoice.amountDetails?.clearanceCharge?.toFixed(2) || "0.00",
        exchangeRate: invoice.amountDetails?.exchangeAmount?.toFixed(2) || "0.00",
        exchangeRateAmount: invoice.amountDetails?.exAmount?.toFixed(2) || "0.00",
      };
    });

    return NextResponse.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
    });
  } catch (error) {
    console.error("Error fetching PTP invoice summary:", error);
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