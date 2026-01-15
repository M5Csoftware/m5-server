import mongoose from "mongoose";

const ServiceMasterSchema = new mongoose.Schema(
    {
        softwareStatus: {
            type: String,
            enum: ["Active", "In-Active"],
            default: "Active",
        },

        portalStatus: {
            type: String,
            enum: ["Active", "In-Active"],
            default: "Active",
        },

        code: {
            type: String,
            required: true,
            trim: true,
            unique: true,
        },

        serviceName: {
            type: String,
            required: true,
            trim: true,
        },

        // NEW: Multiple Pcs configuration
        multiplePcsAllow: {
            type: Boolean,
            default: false,
        },

        noOfPcs: {
            type: Number,
            default: 0,
        },

        // NEW: Average Weight configuration
        averageWeightAllow: {
            type: Boolean,
            default: false,
        },

        averageLimit: {
            type: Number,
            default: 0,
        },

        boxLimit: {
            type: Number,
            default: 0,
        },

        volDiscountPercent: {
            type: Number,
            default: 0,
        },

        perPcs: {
            minActualWeight: { type: Number, default: 0 },
            maxActualWeight: { type: Number, default: 0 },
            minVolumeWeight: { type: Number, default: 0 },
            maxVolumeWeight: { type: Number, default: 0 },
        },

        perAWB: {
            minActualWeight: { type: Number, default: 0 },
            maxActualWeight: { type: Number, default: 0 },
            minVolumeWeight: { type: Number, default: 0 },
            maxVolumeWeight: { type: Number, default: 0 },
            minChargeableWeight: { type: Number, default: 0 },
            maxChargeableWeight: { type: Number, default: 0 },
        },

        maxShipmentValue: {
            type: Number,
            default: 0,
        },

        maxPcsPerAWB: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

export default mongoose.models.ServiceMaster ||
    mongoose.model("ServiceMaster", ServiceMasterSchema);