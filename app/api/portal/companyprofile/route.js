import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import User from "@/app/model/portal/User";
import CompanyProfile from "@/app/model/portal/CompanyProfile";
import PickupAddress from "@/app/model/portal/PickupAddress";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function POST(req) {
    try {
        await connectDB();
        const body = await req.json();

        const {
            userId,
            addressLine1,
            addressLine2,
            pincode,
            city,
            state,
            country,
            sameAsRegistered,
            businessAddressLine1,
            businessAddressLine2,
            businessPincode,
            businessCity,
            businessState,
            businessCountry,
            useForPickup,
            companyPersonName,
            email,
            mobileNumber,
            cinNumber,
            panNumber,
            serviceTaxNumber,
            tanNumber,
            accountCode,
        } = body;

        // ✅ Save Company Profile
        const companyProfile = await CompanyProfile.findOneAndUpdate(
            { userId },
            {
                registeredAddress: {
                    addressLine1,
                    addressLine2,
                    pincode,
                    city,
                    state,
                    country,
                },
                businessAddress: {
                    sameAsRegistered,
                    businessAddressLine1,
                    businessAddressLine2,
                    businessPincode,
                    businessCity,
                    businessState,
                    businessCountry,
                },
                contactDetails: {
                    companyPersonName,
                    email,
                    mobileNumber,
                    cinNumber,
                    panNumber,
                    serviceTaxNumber,
                    tanNumber,
                },
                useForPickup,
            },
            { upsert: true, new: true }
        );

        // ✅ If user wants to use this as pickup address
        if (useForPickup) {
            // Build pickup address data from company info
            const pickupData = {
                accountCode: accountCode,
                name: companyPersonName,
                addressName: "Primary Pickup Address",
                contact: mobileNumber,
                street: businessAddressLine1 || addressLine1,
                locality: businessAddressLine2 || addressLine2 || "",
                landmark: "",
                pincode: businessPincode || pincode,
                city: businessCity || city,
                state: businessState || state,
            };

            await PickupAddress.findOneAndUpdate(
                { accountCode: pickupData.accountCode },
                pickupData,
                { upsert: true, new: true }
            );
        }


        // ✅ Update Customer Account with Contact Details
        if (accountCode) {
            await CustomerAccount.findOneAndUpdate(
                { accountCode },
                {
                    $set: {
                        contactPerson: companyPersonName,
                        email: email,
                        telNo: mobileNumber,
                        panNo: panNumber,
                        gstNo: serviceTaxNumber || "", // you can map accordingly
                        companyName: companyPersonName, // or other mapping
                        addressLine1: businessAddressLine1 || addressLine1,
                        addressLine2: businessAddressLine2 || addressLine2,
                        pinCode: businessPincode || pincode,
                        city: businessCity || city,
                        state: businessState || state,
                        country: businessCountry || country,
                        tanNo: tanNumber || "",
                    },
                },
                { new: true }
            );
        }


        // ✅ Update onboarding progress for user
        await User.findByIdAndUpdate(userId, {
            $set: { "onboardingProgress.companyProfileCompleted": true },
        });

        return NextResponse.json(
            { success: true, companyProfile },
            { status: 200 }
        );
    } catch (error) {
        console.error("Error saving company profile:", error);
        return NextResponse.json(
            { error: "Failed to save company profile", details: error.message },
            { status: 500 }
        );
    }
}
