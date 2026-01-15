import mongoose from "mongoose";

const expenseEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    expenseType: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String },
    receiptAmount: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const ExpenseEntry =
  mongoose.models.ExpenseEntry ||
  mongoose.model("ExpenseEntry", expenseEntrySchema);

export default ExpenseEntry;
