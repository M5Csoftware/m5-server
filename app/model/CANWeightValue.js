import mongoose from "mongoose";

const CANWeightValueSchema = new mongoose.Schema(
  {
    weight: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    valuePerKg: {
      type: Number,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    uploadedBy: {
      type: String,
      default: "system",
    },
  },
  {
    timestamps: true,
  }
);

// Create index if it doesn't exist
CANWeightValueSchema.index({ weight: 1 });

const CANWeightValue = mongoose.models.CANWeightValue || mongoose.model("CANWeightValue", CANWeightValueSchema);

export default CANWeightValue;