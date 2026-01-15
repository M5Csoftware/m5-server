import mongoose from "mongoose";

const VendorSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
    },
    companyName: {
      type: String,
      required: true,
    },
    addressLine1: String,
    addressLine2: String,
    pincode: String,
    city: String,
    state: String,
    country: String,
    managerName: String,
    emailId: String,
    telephoneNo: String,
    panNo: String,
    serviceTaxNo: String,
    cinNo: String,
    
    // Logo Settings
    logo: {
      url: {
        type: String,
        default: null,
      },
      publicId: {
        type: String,
        default: null,
      },
      uploadedAt: {
        type: Date,
        default: null,
      }
    },
    
    // Email Settings
    ssl: {
      type: Boolean,
      default: false,
    },
    smtp: {
      type: String,
      trim: true,
    },
    portNo: {
      type: Number,
      min: [1, "Port number must be greater than 0"],
      max: [65535, "Port number must be less than 65536"],
    },
    from: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function(v) {
          return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: "Invalid email format"
      }
    },
    password: {
      type: String,
    },
    cc: {
      type: String,
      trim: true,
    },
    bcc: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

const Vendor = mongoose.models.Vendor || mongoose.model("Vendor", VendorSchema);
export default Vendor;