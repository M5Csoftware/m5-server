import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import DebitNote from "@/app/model/DebitNote";
import Branch from "@/app/model/Branch";
import CustomerAccount from "@/app/model/CustomerAccount";
import InvoicePTP from "@/app/model/InvoicePTP";

// Helper function to format date to DD/MM/YYYY
const formatDateToDDMMYYYY = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
};

// GET - Fetch branches for dropdown
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // Fetch branches for dropdown
    if (action === "branches") {
      const branches = await Branch.find({}, { code: 1, companyName: 1 }).sort({ code: 1 });
      return NextResponse.json(branches);
    }

    // Fetch customer name by account code
    if (action === "customer") {
      const accountCode = searchParams.get("accountCode");
      
      if (!accountCode) {
        return NextResponse.json(
          { error: "Account code is required" },
          { status: 400 }
        );
      }

      const debitNote = await DebitNote.findOne({
        "clientDetails.accountCode": accountCode
      }).select("clientDetails.customerName clientDetails.accountCode");

      if (!debitNote) {
        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        accountCode: debitNote.clientDetails.accountCode,
        customerName: debitNote.clientDetails.customerName
      });
    }

    return NextResponse.json(
      { error: "Invalid action parameter" },
      { status: 400 }
    );

  } catch (error) {
    console.error("Error in GET request:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// POST - Fetch debit notes based on filters
export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { branch, accountCode, startDate, endDate } = body;

    console.log("Received payload:", body);

    // Build query
    const query = {};

    // Branch filter
    if (branch) {
      query["clientDetails.branch"] = branch;
    }

    // Account code filter
    if (accountCode) {
      query["clientDetails.accountCode"] = accountCode;
    }

    // Date range filter
    if (startDate || endDate) {
      query["clientDetails.invoiceDate"] = {};
      
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query["clientDetails.invoiceDate"]["$gte"] = start;
      }
      
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query["clientDetails.invoiceDate"]["$lte"] = end;
      }
    }

    console.log("Query:", JSON.stringify(query, null, 2));

    // Fetch debit notes
    const debitNotes = await DebitNote.find(query)
      .sort({ "clientDetails.invoiceDate": -1 })
      .lean();

    console.log(`Found ${debitNotes.length} debit notes`);

    // Get unique account codes for lookups
    const accountCodes = [...new Set(debitNotes.map(note => note.clientDetails.accountCode))];

    // Fetch customer accounts for sales person names
    const customerAccounts = await CustomerAccount.find({
      accountCode: { $in: accountCodes }
    }).select("accountCode salesPersonName").lean();

    // Create a map for quick lookup
    const customerMap = {};
    customerAccounts.forEach(customer => {
      customerMap[customer.accountCode] = customer.salesPersonName || "N/A";
    });

    // Fetch invoices for IRN numbers based on account codes
    const invoices = await InvoicePTP.find({
      "clientDetails.accountCode": { $in: accountCodes }
    }).select("clientDetails.accountCode qrCodeData").lean();

    // Create a map for IRN lookup by account code
    const irnMap = {};
    invoices.forEach(invoice => {
      if (invoice.qrCodeData && invoice.qrCodeData.length > 0) {
        const accountCode = invoice.clientDetails.accountCode;
        if (!irnMap[accountCode]) {
          irnMap[accountCode] = invoice.qrCodeData[0].irnNumber || "N/A";
        }
      }
    });

    // Transform data for table display with exact column keys
    const tableData = debitNotes.map((note) => {
      const accountCode = note.clientDetails.accountCode;
      const invoiceNo = note.clientDetails.invoiceNo;

      return {
        SrNo: note.clientDetails.invoiceSrNo || "N/A",
        InvoiceNo: invoiceNo || "N/A",
        InvoiceDate: formatDateToDDMMYYYY(note.clientDetails.invoiceDate), // ✅ Format date here
        CustomerCode: accountCode || "N/A",
        CustomerName: note.clientDetails.customerName || "N/A",
        GSTNo: note.clientDetails.gstNo || "N/A",
        Branch: note.clientDetails.branch || "N/A",
        SalePerson: customerMap[accountCode] || "N/A",
        FromDate: formatDateToDDMMYYYY(startDate), // ✅ Format date here
        ToDate: formatDateToDDMMYYYY(endDate), // ✅ Format date here
        NonTaxable: 0, // Calculate if you have this data
        BasicAmount: parseFloat(note.amountDetails.amount || 0).toFixed(2),
        MiscAmount: "0.00", // Add if you have this field
        Fuel: "0.00", // Add if you have this field
        Taxable: parseFloat(note.amountDetails.amount || 0).toFixed(2), // Assuming amount is taxable
        SGST: parseFloat(note.amountDetails.sgst || 0).toFixed(2),
        CGST: parseFloat(note.amountDetails.cgst || 0).toFixed(2),
        IGST: parseFloat(note.amountDetails.igst || 0).toFixed(2),
        GrandTotal: parseFloat(note.amountDetails.grandTotal || 0).toFixed(2),
        IRN: irnMap[accountCode] || "N/A",
      };
    });

    // Calculate summary
    const summary = {
      totalRecords: tableData.length,
      totalBasicAmount: tableData.reduce((sum, row) => sum + parseFloat(row.BasicAmount || 0), 0),
      totalGrandTotal: tableData.reduce((sum, row) => sum + parseFloat(row.GrandTotal || 0), 0),
      totalSGST: tableData.reduce((sum, row) => sum + parseFloat(row.SGST || 0), 0),
      totalCGST: tableData.reduce((sum, row) => sum + parseFloat(row.CGST || 0), 0),
      totalIGST: tableData.reduce((sum, row) => sum + parseFloat(row.IGST || 0), 0)
    };

    console.log("Returning data:", {
      recordCount: tableData.length,
      summary
    });

    return NextResponse.json({
      success: true,
      data: tableData,
      summary
    });

  } catch (error) {
    console.error("Error in POST request:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}