import mongoose from "mongoose";

const childShipmentSchema = new mongoose.Schema(
  {
    masterAwbNo: {
      type: String,
      required: true,
    },
    destination: {
      type: String,
      required: true,
    },
    childAwbNo: {
      type: String,
      required: true,
    },
    shipperName: String,
    shipperAddress: String,
    shipperCity: String,
    shipperPin: String,
    consigneeName: String,
    consigneeAdd: String,
    consigneeCity: String,
    consigneeState: String,
    consigneeZip: String,
    MAWB: String,
    forwardingNo: {
      type: String,
      default: "",
    },
    forwarder: {
      type: String,
      default: "",
    },
    
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.ChildShipment ||
  mongoose.model("ChildShipment", childShipmentSchema);