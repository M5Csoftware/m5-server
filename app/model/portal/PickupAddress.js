const mongoose = require("mongoose");

const PickupAddressSchema = new mongoose.Schema({
  accountCode: {
    type: String,
    required: true,
  },
  name: { type: String, required: true },
  addressName: { type: String, required: true },
  contact: { type: String, required: true },
  street: { type: String, required: true },
  locality: { type: String, required: true },
  landmark: { type: String },
  pincode: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
}, { timestamps: true });



const PickupAddress = mongoose.models.PickupAddress || mongoose.model("PickupAddress", PickupAddressSchema);

export default PickupAddress;

