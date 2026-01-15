import mongoose from "mongoose";

const LogDetailSchema = new mongoose.Schema(
    {
        awbNo: { type: String, required: true, unique: true },
        accountCode: { type: String, required: true },
        customerName: { type: String, default: "" },
        shipmentDate: { type: Date },
        originCode: { type: String, default: "" },
        sector: { type: String, default: "" },
        destination: { type: String, default: "" },
    },
    { timestamps: true }
);

export default mongoose.models.LogDetail || mongoose.model("LogDetail", LogDetailSchema);
