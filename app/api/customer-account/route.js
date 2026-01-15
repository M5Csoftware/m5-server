import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import cloudinary from "@/app/lib/cloudinary";
import User from "@/app/model/portal/User";
import ShipperTariff from "@/app/model/ShipperTariff";

// Ensure DB connection
connectDB();

export async function POST(req) {
  try {
    const body = await req.json();

    // Upload image helper
    const uploadImage = async (imageData, accountCode) => {
      try {
        const folderPath = `customer-account/${accountCode}`;
        const uploadedImage = await cloudinary.v2.uploader.upload(imageData, {
          folder: folderPath,
        });
        return uploadedImage.secure_url;
      } catch (error) {
        console.error("Error uploading image:", error.message);
        throw new Error("Image upload failed");
      }
    };

    // Validate
    const accountCode = body.accountCode;
    if (!accountCode) {
      throw new Error("accountCode is required");
    }

    // Upload images (if provided)
    let signatureImageUrl = null;
    if (body.signatureImage) {
      signatureImageUrl = await uploadImage(body.signatureImage, accountCode);
    }

    let stampImageUrl = null;
    if (body.stampImage) {
      stampImageUrl = await uploadImage(body.stampImage, accountCode);
    }

    body.signatureImage = signatureImageUrl;
    body.stampImage = stampImageUrl;

    // Save customer account
    const account = new CustomerAccount(body);
    const savedCustomerAccount = await account.save();
    console.log("Customer Account saved:", savedCustomerAccount.accountCode);

    // Create portal user (always create user regardless of enablePortalPassword)
    let savedUser = null;

    const existingUser = await User.findOne({
      $or: [
        { emailId: body.email },
        { accountCode: body.accountCode },
      ],
    });

    if (!existingUser) {
      const newUser = new User({
        accountType: body.accountType || "agent",
        accountCode: body.accountCode,
        fullName: body.contactPerson || body.name || "Unknown",
        companyName: body.name || "",
        emailId: body.email,
        mobileNumber: body.telNo || "",
        addressLine1: body.addressLine1 || "",
        addressLine2: body.addressLine2 || "",
        zipCode: body.pinCode || "",
        city: body.city || "",
        state: body.state || "",
        country: body.country || "",
        gstNumber: body.gstNo || "",
        // Only set password if enablePortalPassword is true
        password: body.enablePortalPassword ? body.portalPasswordSector : undefined,
        status: "approved",
        onboardingProgress: {
          passwordSet: body.enablePortalPassword ? true : false,
          companyProfileCompleted: true,
          kycCompleted: true,
        },
      });

      savedUser = await newUser.save();
      console.log("✅ New User created:", savedUser.accountCode);
    } else {
      console.log("⚠️ User already exists for accountCode/email");
      savedUser = existingUser;
    }

    // selected services from customer
    const selectedServices = body.serviceSettingServiceTable || [];

    // Always create a NEW ShipperTariff when account is created
    const shipperTariffDoc = new ShipperTariff({
      accountCode,
      ratesApplicable: selectedServices.map(svc => ({
        sector: svc.sector,
        service: svc.service,
        zoneMatrix: "",
        network: "",
        rateTariff: "",
        mode: "Normal Rate",
        from: null,
        to: null,
      }))
    });

    // Save tariff record separately
    await shipperTariffDoc.save();
    console.log("New Tariff Created for Account:", accountCode);

    // Return clean response
    return NextResponse.json(
      {
        message: "Customer Account created successfully",
        customerAccount: savedCustomerAccount,
        user: savedUser,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in CustomerAccount POST:", error.message, error.stack);
    return NextResponse.json(
      { error: "Failed to add Customer Account", details: error.message },
      { status: 400 }
    );
  }
}

export async function GET(req) {
  try {
    const accountCode = req.nextUrl.searchParams.get("accountCode");
    const selectedBranch = req.nextUrl.searchParams.get("selectedBranch");

    if (accountCode) {
      // ✅ Fetch single account by accountCode
      const customerAccount = await CustomerAccount.findOne({ accountCode });

      if (!customerAccount) {
        return NextResponse.json(
          { error: "Customer account not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(customerAccount, { status: 200 });
    } else if (selectedBranch) {
      // ✅ Fetch all accounts by selectedBranch
      const accounts = await CustomerAccount.find({ selectedBranch });
      return NextResponse.json(accounts, { status: 200 });
    } else {
      // ✅ Fetch all accounts
      const allAccounts = await CustomerAccount.find({});
      return NextResponse.json(allAccounts, { status: 200 });
    }
  } catch (error) {
    console.error("Error in fetching CustomerAccount:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch Customer Account", details: error.message },
      { status: 400 }
    );
  }
}

export async function PUT(req) {
  try {
    const body = await req.json();
    console.log("PUT body:", body);

    const accountCode = body.accountCode;
    if (!accountCode) {
      throw new Error("accountCode is required for updating");
    }

    // Helper to decide if a string is a base64 data URL
    const isBase64DataUrl = (str) =>
      typeof str === "string" && /^data:image\/[a-zA-Z]+;base64,/.test(str);

    // Helper to decide if a string is a remote URL
    const isRemoteUrl = (str) =>
      typeof str === "string" && /^(https?:)?\/\//.test(str);

    const uploadImage = async (imageData, accountCode, imageKey = "") => {
      try {
        const folderPath = `customer-account/${accountCode}`;
        const uploadOptions = { folder: folderPath };
        const uploadedImage = await cloudinary.v2.uploader.upload(
          imageData,
          uploadOptions
        );
        return uploadedImage.secure_url;
      } catch (error) {
        console.error("Error uploading image to Cloudinary:", error.message);
        throw new Error("Image upload failed");
      }
    };

    // Get existing document first
    const existing = await CustomerAccount.findOne({ accountCode }).lean();
    if (!existing) {
      throw new Error("Customer account not found for update");
    }

    const updatePayload = { ...body };

    // Process image fields
    const imageFields = ["signatureImage", "stampImage"];
    for (const field of imageFields) {
      if (!(field in body)) {
        delete updatePayload[field];
        continue;
      }

      const incoming = body[field];

      if (incoming === null) {
        updatePayload[field] = null;
        continue;
      }

      if (isBase64DataUrl(incoming)) {
        try {
          const uploadedUrl = await uploadImage(incoming, accountCode, field);
          updatePayload[field] = uploadedUrl;
        } catch (err) {
          console.error(`Failed to upload ${field}:`, err.message);
          throw err;
        }
        continue;
      }

      if (isRemoteUrl(incoming)) {
        updatePayload[field] = incoming;
        continue;
      }

      if (typeof incoming === "string" && incoming.trim().length > 0) {
        console.warn(`Unrecognized ${field} content; keeping existing value`);
        updatePayload[field] = existing[field] ?? null;
        continue;
      }

      if (incoming === "") {
        updatePayload[field] = null;
        continue;
      }
    }

    // Update CustomerAccount
    const updatedCustomerAccount = await CustomerAccount.findOneAndUpdate(
      { accountCode },
      { $set: updatePayload },
      { new: true }
    );

    if (!updatedCustomerAccount) {
      throw new Error("Customer account not found for update");
    }

    // Update or Create User record
    let updatedUser = null;
    
    const existingUser = await User.findOne({ accountCode });

    if (existingUser) {
      // Update existing user
      const userUpdateData = {
        accountType: body.accountType || existingUser.accountType,
        fullName: body.contactPerson || body.name || existingUser.fullName,
        companyName: body.name || existingUser.companyName,
        emailId: body.email || existingUser.emailId,
        mobileNumber: body.telNo || existingUser.mobileNumber,
        addressLine1: body.addressLine1 || existingUser.addressLine1,
        addressLine2: body.addressLine2 || existingUser.addressLine2,
        zipCode: body.pinCode || existingUser.zipCode,
        city: body.city || existingUser.city,
        state: body.state || existingUser.state,
        country: body.country || existingUser.country,
        gstNumber: body.gstNo || existingUser.gstNumber,
      };

      // Only update password if enablePortalPassword is true and password is provided
      if (body.enablePortalPassword && body.portalPasswordSector) {
        userUpdateData.password = body.portalPasswordSector;
        userUpdateData['onboardingProgress.passwordSet'] = true;
      }

      updatedUser = await User.findOneAndUpdate(
        { accountCode },
        { $set: userUpdateData },
        { new: true }
      );

      console.log("✅ User updated:", updatedUser.accountCode);
    } else {
      // Create new user if doesn't exist
      const newUser = new User({
        accountType: body.accountType || "agent",
        accountCode: body.accountCode,
        fullName: body.contactPerson || body.name || "Unknown",
        companyName: body.name || "",
        emailId: body.email,
        mobileNumber: body.telNo || "",
        addressLine1: body.addressLine1 || "",
        addressLine2: body.addressLine2 || "",
        zipCode: body.pinCode || "",
        city: body.city || "",
        state: body.state || "",
        country: body.country || "",
        gstNumber: body.gstNo || "",
        password: body.enablePortalPassword ? body.portalPasswordSector : undefined,
        status: "approved",
        onboardingProgress: {
          passwordSet: body.enablePortalPassword ? true : false,
          companyProfileCompleted: true,
          kycCompleted: true,
        },
      });

      updatedUser = await newUser.save();
      console.log("✅ New User created during update:", updatedUser.accountCode);
    }

    // Update ShipperTariff
    const selectedServices = body.serviceSettingServiceTable || [];
    let shipperTariffDoc = await ShipperTariff.findOne({ accountCode });

    if (!shipperTariffDoc) {
      shipperTariffDoc = new ShipperTariff({
        accountCode,
        ratesApplicable: []
      });
    }

    selectedServices.forEach(svc => {
      const exists = shipperTariffDoc.ratesApplicable.some(
        r => r.sector === svc.sector && r.service === svc.service
      );

      if (!exists) {
        shipperTariffDoc.ratesApplicable.push({
          sector: svc.sector,
          service: svc.service,
          zoneMatrix: "",
          network: "",
          rateTariff: "",
          mode: "Normal Rate",
          from: null,
          to: null
        });
      }
    });

    await shipperTariffDoc.save();
    console.log("Tariff Updated for Account:", accountCode);

    console.log("Updated Customer Account:", updatedCustomerAccount);
    return NextResponse.json(
      {
        message: "Customer Account updated successfully",
        customerAccount: updatedCustomerAccount,
        user: updatedUser,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "Error in updating CustomerAccount:",
      error.message,
      error.stack
    );
    return NextResponse.json(
      { error: "Failed to update Customer Account", details: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("code");

    if (!accountCode) {
      return NextResponse.json(
        { error: "Account code is required" },
        { status: 400 }
      );
    }

    const deletedAccount = await CustomerAccount.findOneAndDelete({
      accountCode,
    });

    if (!deletedAccount) {
      return NextResponse.json(
        { error: "Customer Account not found" },
        { status: 404 }
      );
    }

    // Also delete associated user
    await User.findOneAndDelete({ accountCode });
    console.log("✅ Associated user deleted for account:", accountCode);

    return NextResponse.json(
      { message: "Customer Account deleted successfully", deletedAccount },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Deletion failed", details: error.message },
      { status: 500 }
    );
  }
}