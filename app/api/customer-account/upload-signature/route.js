import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import cloudinary from "@/app/lib/cloudinary";

// Ensure DB connection
connectDB();

export async function POST(req) {
  try {
    const body = await req.json(); // Parse JSON body
    console.log("Request body:", body); // Log incoming body for debugging

    // Handle image uploads to Cloudinary
    const uploadImage = async (imageData, accountCode) => {
      try {
        // Construct folder path dynamically using accountCode
        const folderPath = `customer-account/${accountCode}`;

        // Upload the image to the dynamically constructed path
        const uploadedImage = await cloudinary.v2.uploader.upload(imageData, {
          folder: folderPath,
        });
        return uploadedImage.secure_url;
      } catch (error) {
        console.error("Error uploading image to Cloudinary:", error.message);
        throw new Error("Image upload failed");
      }
    };

    // Ensure accountCode is present in the request body
    const accountCode = body.accountCode;
    if (!accountCode) {
      throw new Error("accountCode is required");
    }

    // Upload signature image if present
    let signatureImageUrl = null;
    if (body.signatureImage) {
      signatureImageUrl = await uploadImage(body.signatureImage, accountCode);
    }

    // Upload stamp image if present
    let stampImageUrl = null;
    if (body.stampImage) {
      stampImageUrl = await uploadImage(body.stampImage, accountCode);
    }

    // Update the body with the uploaded image URLs
    body.signatureImage = signatureImageUrl;
    body.stampImage = stampImageUrl;

    // Save customer account to the database
    const account = new CustomerAccount(body);
    const savedCustomerAccount = await account.save();
    console.log("Customer Account saved:", savedCustomerAccount);

    return NextResponse.json(savedCustomerAccount, { status: 201 });
  } catch (error) {
    console.error("Error in CustomerAccount:", error.message, error.stack);
    return NextResponse.json(
      { error: "Failed to add Customer Account", details: error.message },
      { status: 400 }
    );
  }
}

export async function GET(req) {
  try {
    const accountCode = req.nextUrl.searchParams.get("accountCode");
    const includeDeactivated = req.nextUrl.searchParams.get("includeDeactivated");

    if (accountCode) {
      // Fetch single account by accountCode (regardless of deactivation status)
      const customerAccount = await CustomerAccount.findOne({ accountCode });

      if (!customerAccount) {
        return NextResponse.json(
          { error: "Customer account not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(customerAccount, { status: 200 });
    } else {
      // Fetch all accounts
      // If includeDeactivated=true, show all accounts including deactivated ones
      let query = {};
      if (includeDeactivated !== "true") {
        query = { deactivateStatus: { $ne: true } };
      }
      
      const allAccounts = await CustomerAccount.find(query);
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

    // Find existing customer account
    const existing = await CustomerAccount.findOne({ accountCode }).lean();
    if (!existing) {
      throw new Error("Customer account not found for update");
    }

    const updatePayload = { ...body };

    // Handle deactivation/activation logic
    if ("deactivateStatus" in body) {
      if (body.deactivateStatus === true) {
        // Deactivating account
        updatePayload.deactivateStatus = true;
        
        // Save the deactivate reason from modal to deactivateReason field
        if (body.deactivateReasonModal) {
          updatePayload.deactivateReason = body.deactivateReasonModal;
        }
        
        // Remove the modal field as it's not in schema
        delete updatePayload.deactivateReasonModal;
      } else if (body.deactivateStatus === false) {
        // Activating account
        updatePayload.deactivateStatus = false;
        updatePayload.deactivateReason = ""; // Clear the reason when activating
        
        // Remove the modal field
        delete updatePayload.deactivateReasonModal;
      }
    }

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

    // Update the DB
    const updatedCustomerAccount = await CustomerAccount.findOneAndUpdate(
      { accountCode },
      { $set: updatePayload },
      { new: true }
    );

    if (!updatedCustomerAccount) {
      throw new Error("Customer account not found for update");
    }

    console.log("Updated Customer Account:", updatedCustomerAccount);
    return NextResponse.json(updatedCustomerAccount, { status: 200 });
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