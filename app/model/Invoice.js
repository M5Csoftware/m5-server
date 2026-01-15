import mongoose from "mongoose";

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceSrNo: { type: Number, required: true, unique: true },
    invoiceNumber: { type: String, required: true, unique: true },
    invoiceDate: Date,
    fromDate: Date,
    toDate: Date,
    branch: String,
    createdBy: { type: String },

    customer: {
      accountCode: String,
      name: String,
      address1: String,
      address2: String,
      city: String,
      pincode: String,
      country: String,
      panNo: String,
      gst: String,
      gstNo: String,
      state: String,
      phone: String,
    },

    shipments: [
      {
        awbNo: String,
        date: Date,
        destination: String,
        state: String,
        product: String,
        weight: Number,
        amount: Number,
        discount: Number,
        miscCharge: Number,
        taxableAmount: Number,
        receiverFullName: String,
        receiverCity: String,
        receiverState: String,
        receiverPincode: String,
        receiverAddressLine1: String,
        receiverAddressLine2: String,
        shipmentType: String,
        goodstype: String,
        payment: String,
        pcs: Number,
        totalActualWt: Number,
        totalVolWt: Number,
        sector: String,
      },
    ],

    invoiceSummary: {
      nonTaxableAmount: { type: Number, default: 0 },
      basicAmount: { type: Number, default: 0 },
      discountAmount: { type: Number, default: 0 },
      miscChg: { type: Number, default: 0 },
      fuelChg: { type: Number, default: 0 },
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      igst: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
    },

    qrCodeData: {
      type: [
        {
          ackNo: { type: String, default: "" },
          ackDate: { type: String, default: "" },
          irnNumber: { type: String, default: "" },
          qrCode: { type: String, default: "" },
          invoiceType: { type: String, default: "" },
          invoiceIRNDate: { type: Date, default: null },
          isExcel: { type: Boolean, default: false }, // Boolean field
        }
      ],
      default: []
    },

    placeOfSupply: String,
    financialYear: String,
    totalAwb: Number,
  },
  { 
    timestamps: true,
    strict: false // Allow fields not in schema to be saved
  }
);

export default mongoose.models.Invoice ||
  mongoose.model("Invoice", InvoiceSchema);