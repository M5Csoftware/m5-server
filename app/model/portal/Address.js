// app/model/Address.js
import mongoose from 'mongoose';

const AddressSchema = new mongoose.Schema({
  accountCode: {
    type: String,
    required: true,
  },
  fullName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  kycType: {
    type: String,
    required: true,
  },

  kycNumber: {
    type: String,
    required: true,
  },

  kycBackUrl: {
    type: String,
    // required: true,
  },
  kycFrontUrl: {
    type: String,
    // required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  addressLine1: {
    type: String,
    required: true,
  },
  addressLine2: String,
  pincode: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
  addressType: { // New field for address type
    type: String,
    enum: ['Consignee', 'Consignor'], // Example options
    required: true,
  },
});

const Address = mongoose.models.Address || mongoose.model('Address', AddressSchema);

export default Address;
