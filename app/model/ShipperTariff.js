// models/ShipperTariff.js
import mongoose from "mongoose";

const TariffSchema = new mongoose.Schema(
  {
    sector: { type: String, default: "" },
    service: { type: String, default: "" },
    zoneMatrix: { type: String, default: "" },
    network: { type: String, default: "" },
    rateTariff: { type: String, default: "" },
    mode: { type: String, default: "" },
    from: { type: Date, default: null },
    to: { type: Date, default: null },
  },
  { _id: false } // don’t create _id for each subdoc
);
const ShipperTariffSchema = new mongoose.Schema(
  {
    accountCode: {
      type: String,
      trim: true,
    },
    ratesApplicable: { type: [TariffSchema], default: [] },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);
const ShipperTariff =
  mongoose.models.ShipperTariff ||
  mongoose.model("ShipperTariff", ShipperTariffSchema);

export default ShipperTariff;
