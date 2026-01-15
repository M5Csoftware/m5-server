const mongoose = require("mongoose");

const manifestSchema = new mongoose.Schema({
  manifestNumber: { type: String, required: true, unique: true },
  accountCode: { type: String, required: true },
  awbNumbers: [String], // List of shipments
  pickupType: { type: String, default: " " },
  pickupAddress: { type: Object, default: null },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "Active" },
  dropBranchDetails: { type: Object, default: null }
});

export default mongoose.models.Manifest ||
  mongoose.model("Manifest", manifestSchema);
