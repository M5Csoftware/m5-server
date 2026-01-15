import mongoose from "mongoose";

const invoicePTPSchema = new mongoose.Schema(
  {
    fYear: {
      type: String,
      required: true,
      trim: true,
      // Format: "2024-2025"
    },
    // Client Details
    clientDetails: {
      branch: {
        type: String,
        required: true,
        trim: true,
      },
      accountCode: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },
      customerName: {
        type: String,
        required: true,
        trim: true,
      },
      forwarding: {
        type: String,
        trim: true,
      },
      dateFrom: {
        type: Date,
        required: true,
      },
      dateTo: {
        type: Date,
        required: true,
      },
      invoiceDate: {
        type: Date,
        required: true,
      },
      invoiceSrNo: {
        type: String,
        required: true,
        trim: true,
      },
      invoiceNo: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
      },
      gstNo: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
    },
    // Amount Details
    amountDetails: {
      freightAmount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      clearanceCharge: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      grandTotal: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      exchangeAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
      currency: {
        type: String,
        enum: ["AUD", "CAD", "EU", "EUR", "GBP", "INR", "USD"],
        default: "INR",
      },
      exAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    // Bill Items (from the table)
    billItems: [
      {
        awbNo: String,
        shipmentDate: String,
        receiverFullName: String,
        sector: String,
        destination: String,
        service: String,
        receiverCity: String,
        pcs: Number,
        totalActualWt: Number,
        totalVolWt: Number,
        basicAmt: Number,
        discount: Number,
        discountAmount: Number,
        sgst: Number,
        cgst: Number,
        igst: Number,
        miscChg: Number,
        fuelAmt: Number,
        nonTaxable: Number,
        totalAmt: Number,
        payment: String,
        goodDesc: String,
      },
    ],
   qrCodeData: [
      {
        ackNo: { type: String },
        ackDate: { type: String },
        irnNumber: { type: String },
        qrCode: { type: String },
        invoiceType: { type: String },
        invoiceIRNDate: { type: Date },
      }
    ],
  },
  {
    timestamps: true,
  }
);

// Create indexes
invoicePTPSchema.index({ "clientDetails.invoiceNo": 1 });
invoicePTPSchema.index({ "clientDetails.customerCode": 1 });
invoicePTPSchema.index({ fYear: 1 });
invoicePTPSchema.index({ "clientDetails.invoiceDate": 1 });
invoicePTPSchema.index({ status: 1 });

// Compound index for common queries
invoicePTPSchema.index({ fYear: 1, "clientDetails.branch": 1 });
invoicePTPSchema.index({ "clientDetails.customerCode": 1, "clientDetails.invoiceDate": -1 });

const InvoicePTP = mongoose.models.InvoicePTP || mongoose.model("InvoicePTP", invoicePTPSchema);

export default InvoicePTP;