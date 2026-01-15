import mongoose from "mongoose";

const CompanyProfileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    registeredAddress: {
        addressLine1: String,
        addressLine2: String,
        pincode: String,
        city: String,
        state: String,
        country: String,
    },
    businessAddress: {
        sameAsRegistered: Boolean,
        businessAddressLine1: String,
        businessAddressLine2: String,
        businessPincode: String,
        businessCity: String,
        businessState: String,
        businessCountry: String,
    },
    contactDetails: {
        companyPersonName: String,
        email: String,
        mobileNumber: String,
        cinNumber: String,
        panNumber: String,
        serviceTaxNumber: String,
        tanNumber: String,
    },
    useForPickup: { type: Boolean, default: false },
});

export default mongoose.models.CompanyProfile ||
    mongoose.model("CompanyProfile", CompanyProfileSchema);
