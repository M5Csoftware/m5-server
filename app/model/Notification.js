import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
    {
        accountCode: {
            type: String,
            required: true,  // unique identifier for user
        },

        type: {
            type: String,
            enum: [
                "Manifest Requested",
                "Shipment Booked",
                "Shipment received at Hub",
                "Shipment Hold",
            ],
            required: true,
        },

        title: { type: String, required: true },
        description: { type: String, required: true },

        awb: { type: String, required: true },

        pickupCode: { type: String, default: "" },
        address: { type: String, default: "" },
        date: { type: String, default: "" },

        // Status
        isRead: { type: Boolean, default: false },

        // Hold status
        isHold: { type: Boolean, default: false },
        holdReason: { type: String, default: "" },

        // Soft delete
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.models.Notification ||
    mongoose.model("Notification", NotificationSchema);
