import mongoose from "mongoose";

const monthFileSchema = new mongoose.Schema(
  {
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
      max: 2099,
    },
    monthFile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes
monthFileSchema.index({ monthFile: 1 });
monthFileSchema.index({ month: 1, year: 1 });

const MonthFile = mongoose.models.MonthFile || mongoose.model("MonthFile", monthFileSchema);

export default MonthFile;