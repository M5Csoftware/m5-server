import mongoose from "mongoose";

const ShippingBillSchema = new mongoose.Schema(
  {
    awbNo: { 
      type: String, 
      required: true,
      ref: 'Shipment'
    },
    accountCode: { 
      type: String, 
      required: true,
      ref: 'CustomerAccount'
    },
    customerName: { 
      type: String, 
      default: "" 
    },
    pdfFile: {
      fileName: { type: String, required: true },
      fileUrl: { type: String, required: true },
      publicId: { type: String, required: true },
      fileSize: { type: Number, default: 0 },
      uploadedAt: { type: Date, default: Date.now },
    },
    uploadType: {
      type: String,
      enum: ["single", "multiple"],
      default: "single"
    },
    uploadedBy: { 
      type: String, 
      default: "" 
    },
    status: {
      type: String,
      enum: ["uploaded", "processing", "completed", "failed"],
      default: "uploaded"
    }
  },
  { timestamps: true }
);

// Index for faster queries
ShippingBillSchema.index({ awbNo: 1, accountCode: 1 });

export default mongoose.models.ShippingBill ||
  mongoose.model("ShippingBill", ShippingBillSchema);