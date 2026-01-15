// models/CANData.js
import mongoose from "mongoose";

const CANDataSchema = new mongoose.Schema(
  {
    runNo: {
      type: String,
      required: true,
      trim: true,
    },
    dataType: {
      type: String,
      enum: ["manifest", "invoice"],
      required: true,
    },
    // Manifest specific fields
    manifestData: [
      {
        awbNo: { type: String, trim: true },
        shipperName: { type: String, trim: true },
        recieverName: { type: String, trim: true },
        description: { type: String, trim: true },
        destination: { type: String, trim: true },
        pcs: { type: Number, default: 0 },
        weight: { type: Number, default: 0 },
        weightForValue: { type: Number, default: 0 },
        rateRequired: { type: Number, default: 0 },
        valueRequired: { type: Number, default: 0 },
        roundOffRemove: { type: Number, default: 0 },
        finalValue: { type: Number, default: 0 },
        crossCheck: { type: String, trim: true },
      },
    ],
    // Invoice specific fields
    invoiceData: [
      {
        awbNo: { type: String, trim: true },
        box: { type: String, trim: true },
        description: { type: String, trim: true },
        hsn: { type: String, trim: true },
        qty: { type: Number, default: 0 },
        rate: { type: Number, default: 0 },
        amt: { type: Number, default: 0 },
        customValue: { type: Number, default: 0 },
        customCurrency: { type: String, default: "CAD", trim: true },
      },
    ],
    // Run info metadata
    runInfo: {
      runNo: { type: String, trim: true },
      sector: { type: String, default: "CAN", trim: true },
      flight: { type: String, trim: true },
      date: { type: Date },
    },
    // Tracking fields
    modifiedBy: { type: String, trim: true },
    isModified: { type: Boolean, default: false },
    modificationCount: { type: Number, default: 0 },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Compound index for efficient querying
CANDataSchema.index({ runNo: 1, dataType: 1 }, { unique: true });

// Instance method to check if data exists
CANDataSchema.methods.hasData = function () {
  if (this.dataType === "manifest") {
    return this.manifestData && this.manifestData.length > 0;
  } else if (this.dataType === "invoice") {
    return this.invoiceData && this.invoiceData.length > 0;
  }
  return false;
};

// Static method to find or create
CANDataSchema.statics.findOrCreate = async function (runNo, dataType) {
  let doc = await this.findOne({ runNo, dataType });
  if (!doc) {
    doc = new this({ runNo, dataType });
  }
  return doc;
};

export default mongoose.models.CANData ||
  mongoose.model("CANData", CANDataSchema);