// models/CreditLimitTemp.js
import mongoose from "mongoose";

const CreditLimitTemp = new mongoose.Schema(
  {
    customerCode: { type: String, required: true },
    customerName: { type: String },
    branchCode: { type: String },
    branchName: { type: String },
    amount: { type: Number, required: true },
    mode: { type: String, required: true },
    bankName: { type: String },
    receiptType: { type: String },
    debitAmount: { type: Number },
    creditAmount: { type: Number },
    debitNo: { type: String },
    creditNo: { type: String },
    receiptNo: { type: String, unique: true },
    date: { type: Date, default: Date.now },
    remarks: { type: String },
    verifyRemarks: { type: String },
    openingBalance: { type: Number },
    totalSales: { type: Number },
    totalReceipt: { type: Number },
    totalDebit: { type: Number },
    totalCredit: { type: Number },
    totalBalance: { type: Number },

    entryUser: { type: String },

    // Verification fields
    verified: {
      type: String,
      enum: ["Yes", "No"],
      default: "No",
    },
    verifiedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.CreditLimitTemp ||
  mongoose.model("CreditLimitTemp", CreditLimitTemp);
