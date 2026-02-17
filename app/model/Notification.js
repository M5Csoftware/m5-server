import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    accountCode: {
      type: String,
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    awbNo: {
      type: String,
      index: true, 
    },

    event: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true, 
    },

    message: {
      type: String,
      required: true, 
    },

    link: String,

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    emailSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ accountCode: 1, isRead: 1, createdAt: -1 });

export default mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
