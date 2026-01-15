import InvoicePTP from "@/app/model/InvoicePTP";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Ensure DB connection
connectDB();

// POST - Create new invoice
export async function POST(req) {
  try {
    const body = await req.json();
    console.log("Request body:", body);

    // Validate required fields
    if (!body.fYear || !body.clientDetails || !body.amountDetails) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Save invoice to database
    const invoice = new InvoicePTP(body);
    const savedInvoice = await invoice.save();
    console.log("Invoice saved:", savedInvoice);

    // Update shipments with invoice details
    try {
      const invoiceNo = savedInvoice.clientDetails.invoiceSrNo;
      const awbNumbers = savedInvoice.billItems.map(item => item.awbNo).filter(Boolean);

      if (awbNumbers.length > 0) {
        // Update all shipments in the invoice
        const updateResult = await Shipment.updateMany(
          { awbNo: { $in: awbNumbers } },
          {
            $set: {
              isBilled: true,
              billNo: invoiceNo
            }
          }
        );

        console.log(`Updated ${updateResult.modifiedCount} shipments with invoice ${invoiceNo}`);
      }
    } catch (updateError) {
      console.error("Error updating shipments:", updateError);
      // Don't fail the entire request if shipment update fails
      // The invoice was already created successfully
    }

    return NextResponse.json(
      { 
        message: "Invoice created successfully",
        data: savedInvoice 
      }, 
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in creating Invoice:", error.message, error.stack);
    return NextResponse.json(
      { error: "Failed to create Invoice", details: error.message },
      { status: 400 }
    );
  }
}

// GET - Fetch invoices
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceNo = searchParams.get("invoiceNo");
    const accountCode = searchParams.get("accountCode");
    const branch = searchParams.get("branch");
    const fYear = searchParams.get("fYear");

    let query = {};

    if (invoiceNo) {
      query["clientDetails.invoiceNo"] = invoiceNo;
    }
    if (accountCode) {
      query["clientDetails.accountCode"] = accountCode;
    }
    if (branch) {
      query["clientDetails.branch"] = branch;
    }
    if (fYear) {
      query.fYear = fYear;
    }

    if (Object.keys(query).length > 0) {
      const invoices = await InvoicePTP.find(query).sort({ createdAt: -1 });
      return NextResponse.json(invoices, { status: 200 });
    } else {
      const allInvoices = await InvoicePTP.find({}).sort({ createdAt: -1 });
      return NextResponse.json(allInvoices, { status: 200 });
    }
  } catch (error) {
    console.error("Error in fetching Invoices:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch Invoices", details: error.message },
      { status: 400 }
    );
  }
}

// PUT - Update invoice
export async function PUT(req) {
  try {
    const body = await req.json();
    console.log("PUT body:", body);

    const invoiceNo = body.clientDetails?.invoiceNo;
    if (!invoiceNo) {
      throw new Error("invoiceNo is required for updating");
    }

    const updatedInvoice = await InvoicePTP.findOneAndUpdate(
      { "clientDetails.invoiceNo": invoiceNo },
      { $set: body },
      { new: true }
    );

    if (!updatedInvoice) {
      throw new Error("Invoice not found for update");
    }

    console.log("Updated Invoice:", updatedInvoice);
    return NextResponse.json(
      {
        message: "Invoice updated successfully",
        data: updatedInvoice
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in updating Invoice:", error.message, error.stack);
    return NextResponse.json(
      { error: "Failed to update Invoice", details: error.message },
      { status: 400 }
    );
  }
}

// DELETE - Delete invoice
// DELETE - Delete invoice
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceSrNo = searchParams.get("invoiceNo"); // This parameter name can stay the same

    if (!invoiceSrNo) {
      return NextResponse.json(
        { error: "Invoice number is required" },
        { status: 400 }
      );
    }

    const deletedInvoice = await InvoicePTP.findOneAndDelete({
      "clientDetails.invoiceSrNo": invoiceSrNo, // ← Change this line
    });

    if (!deletedInvoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Revert shipment billing status when invoice is deleted
    try {
      const awbNumbers = deletedInvoice.billItems.map(item => item.awbNo).filter(Boolean);
      
      if (awbNumbers.length > 0) {
        await Shipment.updateMany(
          { awbNo: { $in: awbNumbers } },
          {
            $set: {
              isBilled: false,
              billNo: ""
            }
          }
        );
        console.log(`Reverted billing status for ${awbNumbers.length} shipments`);
      }
    } catch (updateError) {
      console.error("Error reverting shipment status:", updateError);
    }

    return NextResponse.json(
      { message: "Invoice deleted successfully", data: deletedInvoice },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Deletion failed", details: error.message },
      { status: 500 }
    );
  }
}