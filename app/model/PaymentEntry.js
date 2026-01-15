import mongoose from "mongoose";

const PaymentEntrySchema = new mongoose.Schema(
  {
    customerCode: { type: String },
    accountCode: { type: String, required: true },
    customerName: { type: String },
    branchCode: { type: String },
    branchName: { type: String },

    amount: { type: Number, required: true },
    mode: { type: String, required: true },
    chequeNo: { type: String },
    bankName: { type: String },
    entryUser: { type: String, required: true },
    verifiedBy: { type: String },
    receiptType: {
      type: String,
    },
    debitAmount: { type: Number, default: 0 },
    creditAmount: { type: Number, default: 0 },
    debitNo: { type: String },
    creditNo: { type: String },

    receiptNo: { type: String },
    date: { type: Date, default: Date.now },

    remarks: { type: String },
    verifyRemarks: { type: String },

    openingBalance: { type: Number },
    closingBalance: { type: Number },

    verified: {
      type: String,
      enum: ["Yes", "No"],
      default: "No", // always starts as No
    },
  },
  { timestamps: true }
);

export default mongoose.models.PaymentEntry ||
  mongoose.model("PaymentEntry", PaymentEntrySchema);
