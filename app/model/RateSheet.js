import mongoose from "mongoose";


const RateSheetSchema = new mongoose.Schema(
  {
    shipper: {
      type: String,
      required: true,
    },
    network: {
      type: String,
      required: true,
    },
    service: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    minWeight: {
      type: Number,
      required: true,
    },
    maxWeight: {
      type: Number,
      required: true,
    },
    sector: {
      type: String,
      required: false,
    },
    effectiveFrom: {
      type: Date,
      required: false,
    },
    to: {
      type: Date,
      required: false,
    },
    zoneTariff: {
      type: String,
      required: false,
    },
    rateSheetName: { 
      type: String, 
      required: false,
    },
    "1": {
      type: Number,
      required: false,
    },
    "2": {
      type: Number,
      required: false,
    },  
    "3": {  
      type: Number,
      required: false,
    },
    "4": {
      type: Number,
      required: false,
    },
    "5": {
      type: Number,
      required: false,
    },
    "6": {
      type: Number,
      required: false,
    },
    "7": {
      type: Number,
      required: false,
    },
    "8": {
      type: Number,
      required: false,
    },
    "9": {
      type: Number,
      required: false,
    },
    "10": {
      type: Number,
      required: false,
    },
    "11": {
      type: Number,
      required: false,
    },
    "12": {
      type: Number,
      required: false,
    },
    "13": {
      type: Number,
      required: false,
    },
    "14": {
      type: Number,
      required: false,
    },
    "15": {
      type: Number,
      required: false,
    },
    "16": {
      type: Number,
      required: false,
    },
    "17": {
      type: Number,
      required: false,
    },
    "18": {
      type: Number,
      required: false,
    },
    "19": {
      type: Number,
      required: false,
    },
    "20": {
      type: Number,
      required: false,
    },
    "21": {
      type: Number,
      required: false,
    },
    "22": {
      type: Number,
      required: false,
    },
    "23": {
      type: Number,
      required: false,
    },
    "24": {
      type: Number,
      required: false,
    },
    "25": {
      type: Number,
      required: false,
    },
    "26": {
      type: Number,
      required: false,
    },
    "27": {
      type: Number,
      required: false,
    },
    "28": {
      type: Number,
      required: false,
    },
    "29": {
      type: Number,
      required: false,
    },
    "30": {
      type: Number,
      required: false,
    },
    "31": {
      type: Number,
      required: false,
    },
    "32": {
      type: Number,
      required: false,
    },
    "33": {
      type: Number,
      required: false,
    },
    "34": {
      type: Number,
      required: false,
    },
    "35": {
      type: Number,
      required: false,
    },
  },
  { timestamps: true } // Automatically manage createdAt and updatedAt fields
);

// Create and export the model
const RateSheet =
  mongoose.models.RateSheet || mongoose.model("RateSheet", RateSheetSchema);
export default RateSheet;
