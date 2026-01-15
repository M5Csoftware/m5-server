// app/model/portal/CSBSetting.js
import mongoose from "mongoose";

const CSBSettingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Exporter name is required"],
      trim: true,
    },

    kyc: {
      type: String,
      required: [true, "KYC Number is required"],
      trim: true,
    },

    iec: {
      type: String,
      required: [true, "IEC Code is required"],
      trim: true,
    },

    gst: {
      type: String,
      trim: true,
      default: "",
    },

    adCode: {
      type: String,
      trim: true,
      default: "",
    },

    termsOfInvoice: {
      type: String,
      default: "",
    },

    crnNumber: {
      type: String,
      trim: true,
      default: "",
    },

    mhbsNumber: {
      type: String,
      trim: true,
      default: "",
    },

    accountCode: {
      type: String,
      trim: true,
      default: "",
    },

    exportThroughEcommerce: {
      type: Boolean,
      default: false,
    },

    meisScheme: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster performance
CSBSettingSchema.index({ kyc: 1 });
CSBSettingSchema.index({ iec: 1 });

const CSBSetting =
  mongoose.models.CSBSetting ||
  mongoose.model("CSBSetting", CSBSettingSchema);

export default CSBSetting;
