import InvoicePTP from "@/app/model/InvoicePTP";
import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// GET method for fetching invoice summary with filters
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const branch = searchParams.get("branch");
    const accountCode = searchParams.get("accountCode");

    // Validate required fields
    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        {
          success: false,
          message: "Date range is required (dateFrom and dateTo)",
        },
        { status: 400 }
      );
    }

    // Build query - query on dateFrom and dateTo fields
    const query = {
      "clientDetails.dateFrom": { $gte: new Date(dateFrom) },
      "clientDetails.dateTo": { $lte: new Date(dateTo) },
    };

    // Add optional filters
    if (branch) {
      query["clientDetails.branch"] = branch;
    }

    if (accountCode) {
      query["clientDetails.accountCode"] = accountCode;
    }

    // Fetch invoice data
    const invoices = await InvoicePTP.find(query)
      .sort({ "clientDetails.invoiceDate": -1 })
      .lean();

    if (!invoices || invoices.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "No invoices found for the selected criteria",
          data: [],
          count: 0,
        },
        { status: 200 }
      );
    }

    // Get unique customer codes to fetch sales person data
    const customerCodes = [
      ...new Set(invoices.map((inv) => inv.clientDetails.accountCode)),
    ];

    // Fetch customer accounts for sales person names
    const customerAccounts = await CustomerAccount.find({
      accountCode: { $in: customerCodes },
    })
      .select("accountCode salesPersonName")
      .lean();

    // Create a map for quick lookup
    const salesPersonMap = {};
    customerAccounts.forEach((customer) => {
      salesPersonMap[customer.accountCode] = customer.salesPersonName || "";
    });

    // Enrich invoice data with sales person names
    const enrichedInvoices = invoices.map((invoice) => ({
      ...invoice,
      salesPersonName:
        salesPersonMap[invoice.clientDetails.accountCode] || "",
    }));

    return NextResponse.json(
      {
        success: true,
        message: `Found ${enrichedInvoices.length} invoice(s)`,
        data: enrichedInvoices,
        count: enrichedInvoices.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in invoice-ptp-summary GET:", error);
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

// POST method for fetching with body parameters (alternative)
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { dateFrom, dateTo, branch, accountCode } = body;

    // Validate required fields
    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        {
          success: false,
          message: "Date range is required (dateFrom and dateTo)",
        },
        { status: 400 }
      );
    }

    // Build query - query on dateFrom and dateTo fields
    const query = {
      "clientDetails.dateFrom": { $gte: new Date(dateFrom) },
      "clientDetails.dateTo": { $lte: new Date(dateTo) },
    };

    // Add optional filters
    if (branch) {
      query["clientDetails.branch"] = branch;
    }

    if (accountCode) {
      query["clientDetails.accountCode"] = accountCode;
    }

    // Fetch invoice data
    const invoices = await InvoicePTP.find(query)
      .sort({ "clientDetails.invoiceDate": -1 })
      .lean();

    if (!invoices || invoices.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "No invoices found for the selected criteria",
          data: [],
          count: 0,
        },
        { status: 200 }
      );
    }

    // Get unique customer codes to fetch sales person data
    const customerCodes = [
      ...new Set(invoices.map((inv) => inv.clientDetails.accountCode)),
    ];

    // Fetch customer accounts for sales person names
    const customerAccounts = await CustomerAccount.find({
      accountCode: { $in: customerCodes },
    })
      .select("accountCode salesPersonName")
      .lean();

    // Create a map for quick lookup
    const salesPersonMap = {};
    customerAccounts.forEach((customer) => {
      salesPersonMap[customer.accountCode] = customer.salesPersonName || "";
    });

    // Enrich invoice data with sales person names
    const enrichedInvoices = invoices.map((invoice) => ({
      ...invoice,
      salesPersonName:
        salesPersonMap[invoice.clientDetails.accountCode] || "",
    }));

    return NextResponse.json(
      {
        success: true,
        message: `Found ${enrichedInvoices.length} invoice(s)`,
        data: enrichedInvoices,
        count: enrichedInvoices.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in invoice-ptp-summary POST:", error);
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