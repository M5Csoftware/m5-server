const mongoose = require("mongoose");

const runSchema = new mongoose.Schema({
  accountType: {
    type: String,
    required: true,
  },
  runNo: {
    type: String,
    required: true,
    unique: true,
  },
  almawb: {
    type: String,
  },
  counterpart: {
    type: String,
  },
  date: { type: Date, default: null },
  cdNumber: {
    type: String,
  },
  destination: {
    type: String,
    default: null,
  },
  flight: {
    type: String,
  },
  flightnumber: {
    type: String,
  },
  hub: {
    type: String,
  },
  obc: {
    type: String,
  },
  origin: {
    type: String,
    default: null,
  },
  sector: {
    type: String,
  },
  transportType: {
    type: String,
    default: null,
  },
  uniqueID: {
    type: String,
  },
}, {timestamps: true});

module.exports = mongoose.models.Run || mongoose.model("Run", runSchema);
