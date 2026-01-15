// app/model/RunProcess.js
import mongoose from "mongoose";

const runProcessSchema = new mongoose.Schema({
  runNo: { 
    type: String, 
    required: true,
    unique: true // Each run number should have one document
  },
  currentStatus: { 
    type: String, 
    required: true 
  },
  currentStepNumber: { 
    type: Number, 
    required: true,
    min: 0,
    max: 9 // Updated to 9 for CP status
  },
  statusHistory: [{
    status: { 
      type: String, 
      required: true 
    },
    stepNumber: {
      type: Number,
      required: true,
      min: 0,
      max: 9
    },
    date: { 
      type: Date, 
      default: Date.now 
    },
    employeeID: { 
      type: String, 
      required: true 
    },
    department: { 
      type: String, 
      required: true 
    }
  }]
}, { timestamps: true });

// Index for faster queries
runProcessSchema.index({ runNo: 1 });

export default mongoose.models.RunProcess || mongoose.model("RunProcess", runProcessSchema);