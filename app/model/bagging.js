// models/Bagging.js
import mongoose from "mongoose";

const BaggingSchema = new mongoose.Schema(
  {
    // Run Details
    runNo: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    sector: { type: String, trim: true },
    flight: { type: String, trim: true },
    alMawb: { type: String, trim: true },
    counterPart: { type: String, trim: true },
    obc: { type: String, trim: true },
    Mawb: { type: String, trim: true },

    // Bag Details
    mhbsNo: { type: String, trim: true },
    remarks: { type: String, trim: true },

    // Row Data - Items inside the bag
    rowData: [
      {
        awbNo: { type: String, trim: true }, // Master AWB Number (optional)
        childShipment: { type: String, trim: true }, // Child AWB Number (optional)
        bagNo: { type: String, required: true, trim: true },
        bagWeight: { type: Number, required: true },
        runNo: { type: String, required: true, trim: true },
        forwardingNo: { type: String, trim: true },
        remarks: { type: String, trim: true },
        barcodeNo: { type: String, trim: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],

    // Run Summary
    noOfBags: { type: Number, default: 0 },
    noOfAwb: { type: Number, default: 0 },
    runWeight: { type: Number, default: 0 },

    // Club Details
    totalClubNo: { type: Number, default: 0 },
    totalAwb: { type: Number, default: 0 },
    totalWeight: { type: Number, default: 0 },
    uniqueId: { type: String, trim: true },

    // ✅ NEW: Final status
    isFinal: { type: Boolean, default: false },
    finalizedAt: { type: Date },
    finalizedBy: { type: String, trim: true }, // Optional: track who finalized
  },
  {
    timestamps: true,
  }
);

// Indexes for optimization
BaggingSchema.index({ runNo: 1 });
BaggingSchema.index({ "rowData.awbNo": 1 });
BaggingSchema.index({ "rowData.childShipment": 1 });
BaggingSchema.index({ "rowData.bagNo": 1 });
BaggingSchema.index({ "rowData.barcodeNo": 1 });
BaggingSchema.index({ isFinal: 1 }); // ✅ NEW: Index on final status

// Validation to ensure at least one AWB field is present
BaggingSchema.path("rowData").validate(function (rowData) {
  if (!rowData || rowData.length === 0) return true;

  return rowData.every((item) => {
    return item.awbNo || item.childShipment;
  });
}, "Each row must have either awbNo or childShipment");

const Bagging =
  mongoose.models.Bagging || mongoose.model("Bagging", BaggingSchema);

export default Bagging;