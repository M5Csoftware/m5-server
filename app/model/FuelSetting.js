import mongoose from "mongoose";

const FuelSettingSchema = new mongoose.Schema({
  customer: {
    type: String,
    required: true,
  },
  service: {
    type: String,
    required: true,
  },
  taxAmount: {
    type: Number,
    required: true,
  },
  effectiveDate: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true // optional: adds createdAt and updatedAt
});

export default mongoose.models.FuelSetting || mongoose.model("FuelSetting", FuelSettingSchema);
