// File: app/api/billing-invoice/route.js
// Unified Invoice API - handles all invoice-related operations

import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Invoice from "@/app/model/Invoice";
import Shipment from "@/app/model/portal/Shipment";

// ============================================================================
// GET - Handle different query types based on parameters
// ============================================================================
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const accountCode = searchParams.get("accountCode");
    const invoiceNumber = searchParams.get("invoiceNumber");

    // 1️⃣ Get next invoice serial number
    if (action === "nextSrNo") {
      const latestInvoice = await Invoice.findOne({})
        .sort({ invoiceSrNo: -1 })
        .select("invoiceSrNo");

      const nextSrNo = latestInvoice ? latestInvoice.invoiceSrNo + 1 : 1;

      return NextResponse.json({
        success: true,
        nextSrNo,
      });
    }

    // 2️⃣ Get single invoice by invoice number (for PDF generation)
    if (invoiceNumber) {
      console.log("📄 Fetching invoice:", invoiceNumber);

      const invoice = await Invoice.findOne({ invoiceNumber }).lean();

      if (!invoice) {
        return NextResponse.json(
          { success: false, message: "Invoice not found" },
          { status: 404 }
        );
      }

      // Check if invoice has isExcel flag set to true
      if (invoice.qrCodeData?.[0]?.isExcel !== true) {
        console.warn(`⚠️ Invoice ${invoiceNumber} does not have isExcel=true`);
        return NextResponse.json(
          {
            success: false,
            message: "This invoice is not available for download",
          },
          { status: 403 }
        );
      }

      console.log("✅ Invoice fetched successfully:", invoiceNumber);
      return NextResponse.json(invoice, { status: 200 });
    }

    // 3️⃣ Get invoices by account code (filtered by isExcel=true)
    if (accountCode) {
      console.log("📊 Fetching invoices for account:", accountCode);

      // Query invoices where customer.accountCode matches and isExcel is true
      const invoices = await Invoice.find({
        "customer.accountCode": accountCode,
        "qrCodeData.0.isExcel": true, // Filter for isExcel = true
      })
        .sort({ invoiceDate: -1 }) // Sort by most recent first
        .lean();

      // Additional filtering to ensure isExcel is true
      const filteredInvoices = invoices.filter((invoice) => {
        return invoice.qrCodeData?.[0]?.isExcel === true;
      });

      console.log(
        `✅ Found ${filteredInvoices.length} invoices with isExcel=true for account ${accountCode}`
      );

      return NextResponse.json(
        {
          success: true,
          data: filteredInvoices,
          count: filteredInvoices.length,
        },
        { status: 200 }
      );
    }

    // 4️⃣ Get statistics for account
    if (action === "statistics" && accountCode) {
      const totalInvoices = await Invoice.countDocuments({
        "customer.accountCode": accountCode,
      });

      const excelInvoices = await Invoice.countDocuments({
        "customer.accountCode": accountCode,
        "qrCodeData.0.isExcel": true,
      });

      const generatedInvoices = await Invoice.countDocuments({
        "customer.accountCode": accountCode,
        "qrCodeData.0.irnNumber": { $exists: true, $ne: "" },
      });

      const pendingInvoices = await Invoice.countDocuments({
        "customer.accountCode": accountCode,
        $or: [
          { "qrCodeData.0.irnNumber": { $exists: false } },
          { "qrCodeData.0.irnNumber": "" },
        ],
      });

      const invoices = await Invoice.find({
        "customer.accountCode": accountCode,
      }).select("invoiceSummary.grandTotal");

      const totalAmount = invoices.reduce(
        (sum, inv) => sum + (inv.invoiceSummary?.grandTotal || 0),
        0
      );

      return NextResponse.json(
        {
          success: true,
          statistics: {
            totalInvoices,
            excelInvoices,
            generatedInvoices,
            pendingInvoices,
            totalAmount: totalAmount.toFixed(2),
          },
        },
        { status: 200 }
      );
    }

    // 5️⃣ Get all invoices (admin view with pagination)
    if (action === "all") {
      const limit = parseInt(searchParams.get("limit")) || 100;
      const page = parseInt(searchParams.get("page")) || 1;
      const skip = (page - 1) * limit;

      const invoices = await Invoice.find({})
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Invoice.countDocuments();

      return NextResponse.json(
        {
          success: true,
          data: invoices,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
        { status: 200 }
      );
    }

    // Default: missing parameters
    return NextResponse.json(
      {
        success: false,
        message:
          "Missing required parameters. Provide: accountCode, invoiceNumber, or action=nextSrNo/statistics/all",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("❌ Error in GET request:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Server error",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Create new invoice
// ============================================================================
export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();

    const {
      invoiceSrNo,
      invoiceNumber,
      invoiceDate,
      fromDate,
      toDate,
      branch,
      createdBy,
      customer,
      shipments,
      invoiceSummary,
      qrCodeData,
      placeOfSupply,
      financialYear,
      totalAwb,
    } = body;

    // 🔍 Validate required fields
    if (!invoiceSrNo || !invoiceNumber) {
      return NextResponse.json(
        { success: false, message: "Missing invoiceSrNo or invoiceNumber" },
        { status: 400 }
      );
    }

    // ✅ Construct invoice object
    const newInvoice = {
      invoiceSrNo,
      invoiceNumber,
      invoiceDate,
      fromDate,
      toDate,
      branch,
      createdBy,
      customer,
      shipments,
      invoiceSummary,
      qrCodeData: qrCodeData || [
        {
          ackNo: "",
          ackDate: "",
          irnNumber: "",
          qrCode: "",
          invoiceType: "",
          invoiceIRNDate: null,
          isExcel: false, // Default to false
        },
      ],
      placeOfSupply,
      financialYear,
      totalAwb,
    };

    console.log("💾 Creating invoice:", invoiceNumber);

    // 💾 1️⃣ Save the invoice
    const createdInvoice = await Invoice.create(newInvoice);

    // ✅ 2️⃣ Update shipments to mark as billed
    if (shipments && shipments.length > 0) {
      const awbNos = shipments.map((s) => s.awbNo).filter(Boolean);
      if (awbNos.length > 0) {
        await Shipment.updateMany(
          { awbNo: { $in: awbNos } },
          {
            $set: {
              isBilled: true,
              billingLocked: true,
              billNo: invoiceNumber,
            },
          }
        );
        console.log(`✅ Updated ${awbNos.length} shipments as billed`);
      }
    }

    console.log("✅ Invoice created successfully:", invoiceNumber);

    return NextResponse.json(
      { success: true, invoice: createdInvoice },
      { status: 201 }
    );
  } catch (err) {
    console.error("❌ Error creating invoice:", err);
    return NextResponse.json(
      { success: false, message: "Server error", error: err.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH - Update invoice (e.g., update isExcel flag, QR code data)
// ============================================================================
export async function PATCH(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { invoiceNumber, updates } = body;

    if (!invoiceNumber) {
      return NextResponse.json(
        { success: false, message: "Invoice number is required" },
        { status: 400 }
      );
    }

    // Special handling for isExcel flag update
    if (updates.hasOwnProperty("isExcel")) {
      const result = await Invoice.findOneAndUpdate(
        { invoiceNumber },
        { $set: { "qrCodeData.0.isExcel": updates.isExcel } },
        { new: true }
      );

      if (!result) {
        return NextResponse.json(
          { success: false, message: "Invoice not found" },
          { status: 404 }
        );
      }

      console.log(
        `✅ Updated isExcel flag for invoice ${invoiceNumber} to ${updates.isExcel}`
      );

      return NextResponse.json(
        {
          success: true,
          message: `isExcel flag updated to ${updates.isExcel}`,
          invoice: result,
        },
        { status: 200 }
      );
    }

    // General update
    const result = await Invoice.findOneAndUpdate(
      { invoiceNumber },
      { $set: updates },
      { new: true }
    );

    if (!result) {
      return NextResponse.json(
        { success: false, message: "Invoice not found" },
        { status: 404 }
      );
    }

    console.log(`✅ Invoice ${invoiceNumber} updated successfully`);

    return NextResponse.json(
      {
        success: true,
        message: "Invoice updated successfully",
        invoice: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error updating invoice:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update invoice",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete invoice (optional, use with caution)
// ============================================================================
export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const invoiceNumber = searchParams.get("invoiceNumber");

    if (!invoiceNumber) {
      return NextResponse.json(
        { success: false, message: "Invoice number is required" },
        { status: 400 }
      );
    }

    const result = await Invoice.findOneAndDelete({ invoiceNumber });

    if (!result) {
      return NextResponse.json(
        { success: false, message: "Invoice not found" },
        { status: 404 }
      );
    }

    // Optionally unbill the shipments
    if (result.shipments && result.shipments.length > 0) {
      const awbNos = result.shipments.map((s) => s.awbNo).filter(Boolean);
      if (awbNos.length > 0) {
        await Shipment.updateMany(
          { awbNo: { $in: awbNos } },
          {
            $set: {
              isBilled: false,
              billingLocked: false,
              billNo: "",
            },
          }
        );
      }
    }

    console.log(`✅ Invoice ${invoiceNumber} deleted successfully`);

    return NextResponse.json(
      {
        success: true,
        message: "Invoice deleted successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error deleting invoice:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete invoice",
        error: error.message,
      },
      { status: 500 }
    );
  }
}