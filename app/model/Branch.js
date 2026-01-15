import mongoose from "mongoose";

const BranchSchema = new mongoose.Schema({
  code: { type: String, required: true },
  companyName: { type: String, required: true },
  addressLine1: { type: String, required: true },
  addressLine2: { type: String },
  pincode: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, required: true },
  managerName: { type: String, required: true },
  emailId: { type: String, required: true },
  telephone: { type: String },
  panNo: { type: String, required: true },
  serviceTax: { type: String },
  cinNo: { type: String },
});

export default mongoose.models.Branch || mongoose.model("Branch", BranchSchema);
