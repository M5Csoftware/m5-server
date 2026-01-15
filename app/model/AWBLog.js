// app/model/AWBLog.js
import mongoose from "mongoose";

const AWBLogEntrySchema = new mongoose.Schema({
    actionLogDate: { type: Date, default: Date.now },
    action: { type: String, default: "" },
    actionUser: { type: String, default: "" },
    actionSystemIp: { type: String, default: "" },
    department: { type: String, default: "" },
    actionSystemName: { type: String, default: "System" }, // <--- new: hostname / machine name
    // optional: you can add other useful metadata here later
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const AWBLogSchema = new mongoose.Schema({
    awbNo: { type: String, required: true, unique: true, index: true },
    accountCode: { type: String, default: null },
    customer: { type: String, default: "" },
    customerName: { type: String, default: "" }, // convenient top-level copy of customer name
    lastActionSystemName: { type: String, default: "System" }, // store most recent system name
    logs: { type: [AWBLogEntrySchema], default: [] },
}, { timestamps: true });

// Use existing compiled model if present (avoid OverwriteModelError)
const AWBLog = mongoose.models.AWBLog || mongoose.model("AWBLog", AWBLogSchema);

export default AWBLog;
