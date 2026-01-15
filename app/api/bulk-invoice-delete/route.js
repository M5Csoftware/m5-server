import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Invoice from "@/app/model/Invoice";
import CustomerAccount from "@/app/model/CustomerAccount";

// GET method - Fetch invoices based on filters
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const monthFile = searchParams.get("monthFile");
    const customerCode = searchParams.get("customerCode");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    console.log("📋 Fetching invoices with filters:", {
      monthFile,
      customerCode,
      fromDate,
      toDate,
    });

    // Validation - date range is required
    if (!fromDate || !toDate) {
      return NextResponse.json(
        {
          success: false,
          error: "From date and To date are required",
          data: [],
          totalRecords: 0,
        },
        { status: 400 }
      );
    }

    // Build query object - START WITH DATE RANGE ONLY
    const query = {};

    // Filter by date range (REQUIRED - PRIMARY FILTER)
    const from = new Date(fromDate);
    const to = new Date(toDate);
    
    // Set time boundaries for accurate comparison
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    query.invoiceDate = {
      $gte: from,
      $lte: to,
    };

    // ONLY add financialYear filter if monthFile is provided
    // This matches the financialYear field in Invoice collection
    if (monthFile && monthFile.trim() !== "") {
      query.financialYear = monthFile.trim();
    }

    // Filter by customer account code - optional
    if (customerCode && customerCode.trim() !== "") {
      query["customer.accountCode"] = customerCode.trim();
    }

    console.log("🔍 Final Query:", JSON.stringify(query, null, 2));

    try {
      // Fetch invoices with selected fields
      const invoices = await Invoice.find(query)
        .select(
          "invoiceNumber financialYear customer invoiceDate invoiceSummary"
        )
        .sort({ invoiceDate: -1 })
        .lean();

      console.log(`✅ Found ${invoices.length} invoice(s)`);

      if (invoices.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          totalRecords: 0,
          message: "No invoices found for the selected date range",
        });
      }

      // Format data for display
      const formattedData = invoices.map((invoice) => ({
        _id: invoice._id.toString(),
        invoiceNo: invoice.invoiceNumber || "N/A",
        financialYear: invoice.financialYear || "N/A",
        customerCode: invoice.customer?.accountCode || "N/A",
        customerName: invoice.customer?.name || "N/A",
        invoiceDate: invoice.invoiceDate
          ? new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            })
          : "N/A",
        basicAmt: (invoice.invoiceSummary?.basicAmount || 0).toFixed(2),
        miscAmt: (invoice.invoiceSummary?.miscChg || 0).toFixed(2),
        sgst: (invoice.invoiceSummary?.sgst || 0).toFixed(2),
        cgst: (invoice.invoiceSummary?.cgst || 0).toFixed(2),
        igst: (invoice.invoiceSummary?.igst || 0).toFixed(2),
        grandTotal: (invoice.invoiceSummary?.grandTotal || 0).toFixed(2),
      }));

      console.log("📊 Sample formatted data:", formattedData[0]);

      return NextResponse.json({
        success: true,
        data: formattedData,
        totalRecords: formattedData.length,
        message: `Found ${formattedData.length} invoice(s) between ${new Date(fromDate).toLocaleDateString("en-IN")} and ${new Date(toDate).toLocaleDateString("en-IN")}`,
      });
    } catch (error) {
      console.error("❌ Error fetching invoices:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch invoices",
          details: error.message,
          data: [],
          totalRecords: 0,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("❌ Database connection error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Database connection failed",
        details: error.message,
        data: [],
        totalRecords: 0,
      },
      { status: 500 }
    );
  }
}

// POST method - Get customer name by account code
export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { accountCode } = body;

    if (!accountCode) {
      return NextResponse.json(
        {
          success: false,
          error: "Account code is required",
        },
        { status: 400 }
      );
    }

    try {
      const customer = await CustomerAccount.findOne({
        accountCode: accountCode,
      }).select("name accountCode");

      if (!customer) {
        return NextResponse.json(
          {
            success: false,
            error: "Customer not found",
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          accountCode: customer.accountCode,
          name: customer.name,
        },
      });
    } catch (error) {
      console.error("Error fetching customer:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch customer details",
          details: error.message,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Database connection failed",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// DELETE method - Delete selected invoices
export async function DELETE(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { invoiceIds } = body;

    // Validation
    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invoice IDs are required and must be an array",
        },
        { status: 400 }
      );
    }

    try {
      // Delete invoices by their MongoDB _id
      const result = await Invoice.deleteMany({
        _id: { $in: invoiceIds },
      });

      if (result.deletedCount === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "No invoices found to delete",
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} invoice(s)`,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error("Error deleting invoices:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to delete invoices",
          details: error.message,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Database connection failed",
        details: error.message,
      },
      { status: 500 }
    );
  }
}