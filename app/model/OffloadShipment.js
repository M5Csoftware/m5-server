// app/model/OffloadShipment.js
import mongoose from "mongoose";

const offloadShipmentSchema = new mongoose.Schema(
  {
    awbNo: {
      type: String,
      required: true,
      index: true,
    },
    runNo: {
      type: String,
      default: "",
      index: true,
    },
    offloadReason: {
      type: String,
      required: true,
    },
    accountCode: {
      type: String,
      required: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    alertOnEmail: {
      type: Boolean,
      default: false,
    },
    alertOnPortal: {
      type: Boolean,
      default: false,
    },
    updatedInEvents: {
      type: Boolean,
      default: false,
    },
    offloadUser: {
      type: String,
      required: true,
    },
    offloadDate: {
      type: Date,
      default: Date.now,
    },
    offloadTime: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: "Offloaded",
      enum: ["Offloaded", "Pending", "Processed"],
    },
    offloadType: {
      type: String,
      enum: ["AWB", "RUN"],
      default: "AWB",
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for efficient querying
offloadShipmentSchema.index({ awbNo: 1, offloadDate: -1 });
offloadShipmentSchema.index({ runNo: 1, offloadDate: -1 });
offloadShipmentSchema.index({ accountCode: 1 });
offloadShipmentSchema.index({ offloadUser: 1 });

const OffloadShipment =
  mongoose.models.OffloadShipment ||
  mongoose.model("OffloadShipment", offloadShipmentSchema);

export default OffloadShipment;