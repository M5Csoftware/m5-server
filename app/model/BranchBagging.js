import mongoose from "mongoose";

const BranchBaggingSchema = new mongoose.Schema(
  {
    runNo: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
      trim: true,
    },
    cdNo: {
      type: String,
      trim: true,
    },
    obc: {
      type: String,
      trim: true,
    },
    mawb: {
      type: String,
      trim: true,
    },
    transportType: {
      type: String,
      trim: true,
    },
    origin: {
      type: String,
      trim: true,
    },
    hub: {
      type: String,
      trim: true,
    },
    noOfBags: {
      type: Number,
      default: 0,
    },
    noOfAwb: {
      type: Number,
      default: 0,
    },
    bagWeight: {
      type: Number,
      default: 0,
    },
    runWeight: {
      type: Number,
      default: 0,
    },
    totalClubNo: {
      type: Number,
      default: 0,
    },
    totalAwb: {
      type: Number,
      default: 0,
    },
    totalWeight: {
      type: Number,
      default: 0,
    },
    uniqueId: {
      type: String,
      trim: true,
    },
    // NEW: isFinal field to mark branch bagging as finalized
    isFinal: {
      type: Boolean,
      default: false,
    },
    rowData: [
      {
        awbNo: { type: String, trim: true }, // ✅ Made optional - Master AWB Number
        childShipment: { type: String, trim: true }, // ✅ Added - Child AWB Number
        bagNo: {
          type: String,
          required: true,
          trim: true,
        },
        bagWeight: {
          type: Number, // ✅ Changed from String to Number for consistency
          required: true,
        },
        runNo: {
          type: String,
          required: true,
          trim: true,
        },
        forwardingNo: { type: String, trim: true }, // ✅ Added for consistency with Bagging model
        remarks: { type: String, trim: true }, // ✅ Added for tracking
        addedAt: { type: Date, default: Date.now }, // ✅ Added for tracking
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for better query performance
BranchBaggingSchema.index({ runNo: 1 });
BranchBaggingSchema.index({ "rowData.awbNo": 1 }); // ✅ Index on master AWB
BranchBaggingSchema.index({ "rowData.childShipment": 1 }); // ✅ Index on child AWB
BranchBaggingSchema.index({ "rowData.bagNo": 1 });
BranchBaggingSchema.index({ createdAt: -1 });
BranchBaggingSchema.index({ isFinal: 1 }); // ✅ Index for isFinal field

// ✅ Add validation to ensure at least one AWB field is present
BranchBaggingSchema.path('rowData').validate(function(rowData) {
  if (!rowData || rowData.length === 0) return true;
  
  return rowData.every(item => {
    // Each item must have either awbNo or childShipment
    return item.awbNo || item.childShipment;
  });
}, 'Each row must have either awbNo or childShipment');

const BranchBagging =
  mongoose.models.BranchBagging ||
  mongoose.model("BranchBagging", BranchBaggingSchema);

export default BranchBagging;