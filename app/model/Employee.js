import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{8}$/, "User ID must be exactly 8 digits"],
    },
    email: { type: String, required: true },
    userName: { type: String, required: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["User", "Admin", "Branch User", "Counter Part"],
      required: true,
    },
    branch: { type: String },
    hub: { type: String },
    department: { type: String },
    dashboardAccess: {
      type: [String],
      default: [],
    },
    permissions: {
      type: Object,
      default: {},
    },
    stateAssigned: { type: String, default: "" },
    cityAssigned: { type: [], default: [] },
    sector: { type: String, default: "" },
    deactivated: { type: Boolean, default: false },
    createdBy: { type: String, default: "Unknown" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.Employee ||
  mongoose.model("Employee", employeeSchema);