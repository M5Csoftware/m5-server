import mongoose from "mongoose";

const AssignedSectorSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    userId: { type: String, required: true }, 
    userName: { type: String, required: true },
    month: { type: String, required: true },
    department: { type: String, required: true },
    sectors: {
      type: [String],
      required: true,
      default: [],
    },
    remarks: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.AssignedSector ||
  mongoose.model(
    "AssignedSector",
    AssignedSectorSchema
  );
