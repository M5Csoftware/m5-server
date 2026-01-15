import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import DigitalTally from "@/app/model/DigitalTally";
import Shipment from "@/app/model/portal/Shipment"; // import Shipment model
import { logAWB } from "@/app/lib/logAwb";

connectDB();

// POST - Create DigitalTally and update Shipment if match found
export async function POST(req) {
  try {
    const data = await req.json();

    const entryUser = data.entryUser || "Unknown";
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("remote_addr") ||
      "unknown";

    data.inscanUser = data.inscanUser || entryUser || "-";
    data.inscanUserName = data.inscanUserName || "-";

    // Create new DigitalTally entry
    const newEntry = new DigitalTally(data);
    const savedEntry = await newEntry.save();

    // If mawbNumber exists, update Shipment
    if (savedEntry.mawbNumber) {
      let updateData = {};

      if (savedEntry.status === "Hold") {
        updateData = {
          status: "Hold",
          holdReason: savedEntry.holdReason || null,
          operationRemark: savedEntry.remarks || null,
        };
      } else {
        updateData = {
          status: "Arrived at Hub",
        };
      }

      await Shipment.updateOne(
        { awbNo: { $in: savedEntry.mawbNumber } },
        { $set: updateData }
      );
    }

    // ✅ ADD: Log AWB
    const awbNumbers = Array.isArray(savedEntry.mawbNumber)
      ? savedEntry.mawbNumber
      : [savedEntry.mawbNumber];

    // for (const awbNo of awbNumbers) {
    //   if (awbNo) {
    //     await logAWB({
    //       awbNo: awbNo,
    //       action: `${savedEntry.entryType || "Portal"} Entry Saved`,
    //       actionUser: entryUser,
    //       accountCode: savedEntry.code || "",
    //       customerName: savedEntry.client || "",
    //       ip: ip,
    //       meta: {
    //         entryType: savedEntry.entryType,
    //         manifestNumber: savedEntry.manifestNumber,
    //         status: savedEntry.status,
    //         hold: savedEntry.hold,
    //         holdReason: savedEntry.holdReason,
    //       },
    //     });
    //   }
    // }

    return NextResponse.json(savedEntry);
  } catch (error) {
    console.error("Error saving DigitalTally:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update DigitalTally
export async function PUT(req) {
  try {
    const data = await req.json();
    const { id, ...updateFields } = data;

    const updatedEntry = await DigitalTally.findByIdAndUpdate(
      id,
      updateFields,
      {
        new: true,
      }
    );

    if (!updatedEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json(updatedEntry);
  } catch (error) {
    console.error("Error updating DigitalTally:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Fetch All
export async function GET() {
  try {
    const entries = await DigitalTally.find({});
    return NextResponse.json(entries);
  } catch (error) {
    console.error("Error fetching DigitalTally:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete Many
export async function DELETE(req) {
  try {
    const { ids } = await req.json();
    await DigitalTally.deleteMany({ _id: { $in: ids } });
    return NextResponse.json({ message: "Entries deleted successfully" });
  } catch (error) {
    console.error("Error deleting DigitalTally:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
