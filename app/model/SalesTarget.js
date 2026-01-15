import mongoose from "mongoose";

const salesTargetSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      ref: "Employee", // link to Employee.userId
    },
    userName: {
      type: String,
      required: true, // store salesperson name at assignment time
    },
    targetTonnage: { type: Number, default: 0 },
    targetAmount: { type: Number, default: 0 },
    remarks: { type: String, default: "" },
    stateAssigned: { type: String, default: "" },
    citiesAssigned: { type: [String], default: [] },
    customersAssigned: {
      type: [{ accountCode: String, name: String }],
      default: [],
    },

    month: {
      type: String,
      required: true, // e.g. "2025-09"
    },
  },
  { timestamps: true }
);

// Ensure only one target per employee per month
salesTargetSchema.index({ userId: 1, month: 1 }, { unique: true });

export default mongoose.models.SalesTarget ||
  mongoose.model("SalesTarget", salesTargetSchema);
