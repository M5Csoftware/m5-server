import mongoose from "mongoose";

// In your EventActivity model
const eventActivitySchema = new mongoose.Schema(
  {
    awbNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventCode: {
      type: [String],
      default: [],
    },
    eventDate: {
      type: [String], // Change from [Date] to [String]
      default: [],
    },
    eventTime: {
      type: [String],
      default: [],
    },
    status: {
      type: [String],
      default: [],
    },
    eventUser: {
      type: [String],
      default: [],
    },
    eventLocation: {
      type: [String],
      default: [],
    },
    eventLogTime: {
      type: [Date],
      default: [],
    },
    remark: {
      type: String,
      required: false,
    },
    receiverName: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);
// Create index on awbNo for efficient querying
eventActivitySchema.index({ awbNo: 1 });

const EventActivity =
  mongoose.models.EventActivity ||
  mongoose.model("EventActivity", eventActivitySchema);

export default EventActivity;
