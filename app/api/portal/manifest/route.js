import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Manifest from "@/app/model/portal/Manifest";
import Shipment from "@/app/model/portal/Shipment";
import Notification from "@/app/model/Notification";
import { buildShipmentBookedNotification } from "@/app/lib/notificationPayload";

// Ensure DB is connected before handling requests
await connectDB();

export async function POST(req) {
  try {
    const body = await req.json();
    const { awbNumbers, pickupType, pickupAddress, accountCode } = body;
    console.log("POST manifest body:", body);

    if (!Array.isArray(awbNumbers) || awbNumbers.length === 0) {
      return NextResponse.json(
        { message: "AWB numbers are required." },
        { status: 400 }
      );
    }

    // Step 1: Check for already assigned shipments
    const alreadyAssigned = await Shipment.find({
      awbNo: { $in: awbNumbers },
      manifestNumber: { $ne: null },
    });

    if (alreadyAssigned.length > 0) {
      return NextResponse.json(
        {
          message: "Some shipments are already in a manifest.",
          existing: alreadyAssigned.map((s) => s.awbNo),
        },
        { status: 409 }
      );
    }

    // Step 2: Check for AWBs already used in any manifest
    const existingInManifests = await Manifest.find({
      awbNumbers: { $in: awbNumbers },
    }).select("manifestNumber awbNumbers");

    if (existingInManifests.length > 0) {
      const duplicateAwbs = [];
      existingInManifests.forEach((manifest) => {
        const duplicates = manifest.awbNumbers.filter((awb) =>
          awbNumbers.includes(awb)
        );
        duplicates.forEach((awb) => {
          duplicateAwbs.push({
            awbNo: awb,
            existingManifest: manifest.manifestNumber,
          });
        });
      });

      return NextResponse.json(
        {
          message: "Some AWB numbers are already used in existing manifests.",
          duplicates: duplicateAwbs,
        },
        { status: 409 }
      );
    }

    // Step 3: Validate that all AWBs exist as shipments
    const validShipments = await Shipment.find({
      awbNo: { $in: awbNumbers },
    }).select("awbNo");

    const validAwbNumbers = validShipments.map((s) => s.awbNo);
    const invalidAwbs = awbNumbers.filter(
      (awb) => !validAwbNumbers.includes(awb)
    );

    if (invalidAwbs.length > 0) {
      return NextResponse.json(
        {
          message: "Some AWB numbers do not exist as shipments.",
          invalid: invalidAwbs,
        },
        { status: 400 }
      );
    }

    // Step 4: Get last manifest for this accountCode
    const lastManifest = await Manifest.findOne({ accountCode })
      .sort({ createdAt: -1 })
      .lean();

    let counter = 1;
    if (lastManifest?.manifestNumber) {
      const parts = lastManifest.manifestNumber.split("-");
      const lastCounter = parseInt(parts[1], 10);
      if (!isNaN(lastCounter)) {
        counter = lastCounter + 1;
      }
    }

    // Step 5: Generate new manifest number
    const manifestNumber = `${accountCode}-${counter
      .toString()
      .padStart(2, "0")}`;

    // Step 6: Create notification
    const notificationPayload = buildShipmentBookedNotification({
      accountCode: accountCode,
      type: "Manifest Requested",
      title: "Manifest Requested",
      awb: awbNumbers,
      manifestNo: manifestNumber,
    });

    await new Notification(notificationPayload).save();

    // Step 7: Create and save Manifest
    const newManifest = new Manifest({
      manifestNumber,
      accountCode,
      awbNumbers,
      pickupType,
      pickupAddress: pickupType === "pickup" ? pickupAddress : null,
      dropBranchDetails: pickupType === "drop" ? pickupAddress : null,
      status: "pending",
    });

    await newManifest.save();

    // Step 8: Update Shipment records
    const updateData = {
      $set: {
        manifestNo: manifestNumber,
        status: "Manifest Created",
      }
    };

    await Shipment.updateMany(
      { awbNo: { $in: awbNumbers } },
      updateData
    );

    return NextResponse.json(
      {
        success: true,
        manifestNumber,
        message: "Manifest created successfully.",
        awbCount: awbNumbers.length,
        manifest: newManifest,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error creating manifest:", error);
    return NextResponse.json(
      { error: "Failed to create manifest", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const manifestNumber = searchParams.get("manifestNumber");

    if (!manifestNumber) {
      return NextResponse.json(
        { error: "Manifest number is required." },
        { status: 400 }
      );
    }

    const manifest = await Manifest.findOne({ manifestNumber });

    if (!manifest) {
      return NextResponse.json(
        { error: "Manifest not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        manifest,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching manifest:", error);
    return NextResponse.json(
      { error: "Failed to fetch manifest", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    const body = await req.json();
    const { manifestNumber, awbNumbers, pickupType, pickupAddress, status } = body;

    console.log("PUT manifest update:", body);

    let manifest;

    // Find manifest
    if (manifestNumber) {
      manifest = await Manifest.findOne({ manifestNumber });
    } else if (Array.isArray(awbNumbers) && awbNumbers.length > 0) {
      manifest = await Manifest.findOne({ awbNumbers: { $in: awbNumbers } });
    } else {
      return NextResponse.json(
        { message: "Either manifestNumber or awbNumbers array is required." },
        { status: 400 }
      );
    }

    if (!manifest) {
      return NextResponse.json(
        { error: "Manifest not found" },
        { status: 404 }
      );
    }

    // Fields to update
    const updateFields = {};

    // ---- Pickup Type Validation ----
    if (pickupType) {
      if (!["pickup", "drop", "pending"].includes(pickupType)) {
        return NextResponse.json(
          { error: "Invalid pickupType. Must be 'pickup', 'drop', or 'pending'." },
          { status: 400 }
        );
      }
      updateFields.pickupType = pickupType;
    }

    // ---- Address Update Logic ----
    if (pickupAddress !== undefined) {
      if (pickupType === "pickup") {
        updateFields.pickupAddress = pickupAddress;
        updateFields.dropBranchDetails = null;
      }
      if (pickupType === "drop") {
        updateFields.dropBranchDetails = pickupAddress;
        updateFields.pickupAddress = null;
      }
    }

    // ---- Status Update ----
    if (status) updateFields.status = status;

    // ---- Update Manifest ----
    const updatedManifest = await Manifest.findOneAndUpdate(
      { _id: manifest._id },
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    // Determine which AWB numbers to update
    const awbsToUpdate = awbNumbers || manifest.awbNumbers;
    
    // Prepare shipment update data
    const shipmentUpdateData = {
      $set: {
        status: "Manifest Dispatched",
        manifestNo: manifestNumber || manifest.manifestNumber
      }
    };

    // Add origin field if dropping at hub and branch code exists
    if (pickupType === "drop" && pickupAddress) {
      const branchCode = pickupAddress.code || pickupAddress.branchCode;
      if (branchCode) {
        shipmentUpdateData.$set.origin = branchCode;
      }
    }

    // Update Shipment records
    await Shipment.updateMany(
      { awbNo: { $in: awbsToUpdate } },
      shipmentUpdateData
    );

    return NextResponse.json(
      {
        success: true,
        message: "Manifest updated and shipments dispatched successfully.",
        manifest: updatedManifest,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Error updating manifest:", error);
    return NextResponse.json(
      { error: "Failed to update manifest", details: error.message },
      { status: 500 }
    );
  }
}