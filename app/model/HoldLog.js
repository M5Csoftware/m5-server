// app/model/HoldLog.js
import mongoose from "mongoose";

const HoldLogSchema = new mongoose.Schema(
    {
        awbNo: {
            type: String,
            required: true,
            index: true,
        },
        accountCode: {
            type: String,
            default: "",
        },
        customer: {
            type: String,
            default: "",
        },
        departmentName: {
            type: String,
            default: "General",
        },
        holdReason: {
            type: String,
            default: "",
        },
        action: {
            type: String,
            default: "Hold Action",
        },
        actionUser: {
            type: String,
            default: "System",
        },
        actionSystemName: {
            type: String,
            default: "Unknown",
        },
        actionSystemIp: {
            type: String,
            default: "unknown",
        },
        actionLogDate: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.models.HoldLog || mongoose.model("HoldLog", HoldLogSchema);
