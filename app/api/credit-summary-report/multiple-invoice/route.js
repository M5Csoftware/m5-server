import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CreditNote from "@/app/model/CreditNote";
import CustomerAccount from "@/app/model/CustomerAccount";
import InvoicePTP from "@/app/model/InvoicePTP";

// POST - Fetch credit notes based on multiple invoice numbers
export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { branch, invoiceNumbers } = body;

    // Validate input
    if (!invoiceNumbers || !Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
      return NextResponse.json(
        { error: "Invoice numbers array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Build query for multiple invoice numbers
    const query = {
      "clientDetails.invoiceNo": { $in: invoiceNumbers }
    };

    // Add branch filter if provided
    if (branch && branch !== "All") {
      query["clientDetails.branch"] = branch;
    }

    console.log("Query:", JSON.stringify(query)); // Debug log

    // Fetch credit notes matching the invoice numbers
    const creditNotes = await CreditNote.find(query)
      .sort({ "clientDetails.invoiceNo": 1 })
      .lean();

    console.log(`Found ${creditNotes.length} credit notes`); // Debug log

    if (creditNotes.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        summary: {
          totalRecords: 0,
          totalBasicAmount: 0,
          totalGrandTotal: 0,
          totalSGST: 0,
          totalCGST: 0,
          totalIGST: 0
        },
        message: "No records found for the provided invoice numbers"
      });
    }

    // Get unique account codes for lookups
    const accountCodes = [...new Set(creditNotes.map(note => note.clientDetails.accountCode))];

    // Fetch customer accounts for sales person names
    const customerAccounts = await CustomerAccount.find({
      accountCode: { $in: accountCodes }
    }).select("accountCode salesPersonName").lean();

    // Create a map for quick lookup
    const customerMap = {};
    customerAccounts.forEach(customer => {
      customerMap[customer.accountCode] = customer.salesPersonName || "N/A";
    });

    // Fetch invoices for IRN numbers
    const invoices = await InvoicePTP.find({
      "clientDetails.invoiceNo": { $in: invoiceNumbers }
    }).select("clientDetails.invoiceNo qrCodeData").lean();

    // Create a map for IRN lookup by invoice number
    const irnMap = {};
    invoices.forEach(invoice => {
      if (invoice.qrCodeData && invoice.qrCodeData.length > 0) {
        const invoiceNo = invoice.clientDetails.invoiceNo;
        if (!irnMap[invoiceNo]) {
          irnMap[invoiceNo] = invoice.qrCodeData[0].irnNumber || "N/A";
        }
      }
    });

    // Transform data for table display with exact column keys
    const tableData = creditNotes.map((note) => {
      const accountCode = note.clientDetails.accountCode;
      const invoiceNo = note.clientDetails.invoiceNo;

      return {
        SrNo: note.clientDetails.invoiceSrNo || "N/A",
        InvoiceNo: invoiceNo || "N/A",
        InvoiceDate: note.clientDetails.invoiceDate,
        CustomerCode: accountCode || "N/A",
        CustomerName: note.clientDetails.customerName || "N/A",
        GSTNo: note.clientDetails.gstNo || "N/A",
        Branch: note.clientDetails.branch || "N/A",
        SalePerson: customerMap[accountCode] || "N/A",
        FromDate: "N/A",
        ToDate: "N/A",
        NonTaxable: 0,
        BasicAmount: note.amountDetails.amount || 0,
        MiscAmount: 0,
        Fuel: 0,
        Taxable: note.amountDetails.amount || 0,
        SGST: note.amountDetails.sgst || 0,
        CGST: note.amountDetails.cgst || 0,
        IGST: note.amountDetails.igst || 0,
        GrandTotal: note.amountDetails.grandTotal || 0,
        IRN: irnMap[invoiceNo] || "N/A",
      };
    });

    // Calculate summary
    const summary = {
      totalRecords: tableData.length,
      totalBasicAmount: tableData.reduce((sum, row) => sum + (parseFloat(row.BasicAmount) || 0), 0),
      totalGrandTotal: tableData.reduce((sum, row) => sum + (parseFloat(row.GrandTotal) || 0), 0),
      totalSGST: tableData.reduce((sum, row) => sum + (parseFloat(row.SGST) || 0), 0),
      totalCGST: tableData.reduce((sum, row) => sum + (parseFloat(row.CGST) || 0), 0),
      totalIGST: tableData.reduce((sum, row) => sum + (parseFloat(row.IGST) || 0), 0)
    };

    // Round summary values
    summary.totalBasicAmount = parseFloat(summary.totalBasicAmount.toFixed(2));
    summary.totalGrandTotal = parseFloat(summary.totalGrandTotal.toFixed(2));
    summary.totalSGST = parseFloat(summary.totalSGST.toFixed(2));
    summary.totalCGST = parseFloat(summary.totalCGST.toFixed(2));
    summary.totalIGST = parseFloat(summary.totalIGST.toFixed(2));

    console.log("Summary:", summary); // Debug log

    return NextResponse.json({
      success: true,
      data: tableData,
      summary
    });

  } catch (error) {
    console.error("Error in Multiple Invoice POST request:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Internal server error", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}