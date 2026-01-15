import mongoose from "mongoose";

const HistorySchema = new mongoose.Schema(
  {
    action: { type: String, default: "" }, //remarks
    date: { type: Date, default: Date.now },
    actionUser: { type: String, default: "" },
    statusHistory: { type: String, default: "" },
    assignedTo: { type: String },
  },
  { _id: false }
);

const TicketSchema = new mongoose.Schema(
  {
    awbNumber: String,
    accountCode: String,
    ticketId: { type: String, required: true, unique: true },
    sector: String,
    category: String,
    subCategory: String,
    priorityStatus: { type: String, default: "Normal" }, // ✅ new field
    remarks: String,
    status: { type: String, default: "Open" },
    isResolved: { type: Boolean, default: false },
    resolutionDate: String,
    assignedTo: String,
    lastUpdated: String,
    history: { type: [HistorySchema], default: [] }, // ✅ added
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Ticket || mongoose.model("Ticket", TicketSchema);
