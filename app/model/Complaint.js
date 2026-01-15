import mongoose from "mongoose";

const HistorySchema = new mongoose.Schema(
  {
    action: { type: String, default: "" }, //remarks
    date: { type: Date, default: Date.now }, // store full timestamp
    actionUser: { type: String, default: "" },
    statusHistory: { type: String, default: "" },
    assignTo: { type: String },
  },
  { _id: false } // don’t create _id for each subdoc
);

const ComplaintSchema = new mongoose.Schema(
  {
    awbNo: { type: String, required: true, unique: true }, // ✅ remove unique if multiple complaints per AWB
    complaintNo: { type: String, required: true, unique: true },
    complaintID: { type: String, required: true, unique: true },
    date: { type: Date, required: true },
    complaintType: {
      type: String,
      enum: ["High-Priority", "Priority", "Regular"],
      required: true,
    },
    complaintSource: {
      type: String,
      enum: ["Telephone", "Email", "WhatsApp"],
      required: true,
    },
    isResolved: { type: Boolean, default: false },
    caseType: {
      type: String,
      required: true,
    },
    assignTo: {
      type: String,
      required: true,
    },
    remarks: {
      type: String,
    },
    status: {
      type: String,
      enum: ["Open", "Close", "Pending"],
      default: "Open",
    },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: true }
);

const Complaint =
  mongoose.models.Complaint || mongoose.model("Complaint", ComplaintSchema);

export default Complaint;
