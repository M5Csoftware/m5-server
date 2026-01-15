import { NextResponse } from "next/server";
import EventActivity from "@/app/model/EventActivity";
import connectDB from "@/app/lib/db";

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    console.log("📥 POD Entry Incoming Data:", body);

    let data = [];

    // Case 1: Already an array
    if (Array.isArray(body)) {
      data = body;
    }
    // Case 2: Object with numeric keys, e.g. { "0": {...}, "1": {...} }
    else if (
      typeof body === "object" &&
      Object.keys(body).every((key) => !isNaN(key))
    ) {
      data = Object.values(body);
    }
    // Case 3: Single object
    else if (typeof body === "object") {
      data = [body];
    }

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Body must be a non-empty array or object" },
        { status: 400 }
      );
    }

    const savedEvents = [];

    for (const pod of data) {
      const {
        awbNo,
        eventCode,
        eventDate,
        eventTime,
        status,
        eventUser,
        receiverName,
        remark,
        eventLocation,
      } = pod;

      if (!awbNo) {
        console.warn("⚠️ Skipping POD without awbNo:", pod);
        continue;
      }

      const existingEvent = await EventActivity.findOne({ awbNo });

      if (existingEvent) {
        // Update existing record
        const updatedEvent = await EventActivity.findOneAndUpdate(
          { awbNo },
          {
            $push: {
              eventCode: eventCode || "DLV",
              eventDate: eventDate ? new Date(eventDate) : new Date(),
              eventTime: eventTime || "",
              status: status || "Delivered",
              eventUser: eventUser || "",
              eventLocation: eventLocation || "",
              eventLogTime: new Date(),
            },
            $set: {
              receiverName: receiverName || existingEvent.receiverName,
              remark: remark || existingEvent.remark,
            },
          },
          { new: true, runValidators: true }
        );

        savedEvents.push(updatedEvent);
        console.log(`✅ Updated POD for AWB: ${awbNo}`);
      } else {
        // Create new record
        const newEvent = await EventActivity.create({
          awbNo,
          eventCode: [eventCode || "DLV"],
          eventDate: [eventDate ? new Date(eventDate) : new Date()],
          eventTime: [eventTime || ""],
          status: [status || "Delivered"],
          eventUser: [eventUser || ""],
          eventLocation: [eventLocation || ""],
          eventLogTime: [new Date()],
          receiverName: receiverName || "",
          remark: remark || "",
        });

        savedEvents.push(newEvent);
        console.log(`🆕 Created new POD record for AWB: ${awbNo}`);
      }
    }

    return NextResponse.json(
      {
        message: `✅ Successfully processed ${savedEvents.length} POD entry(ies)`,
        data: savedEvents,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ POD Entry Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    await connectDB();
    const body = await req.json();

    // Body should be an array: ["123", "456"] or [123, 456]
    let awbList = [];

    if (Array.isArray(body)) {
      awbList = body.map(String); // convert all to string
    } else {
      return NextResponse.json(
        { error: "Body must be an array of AWB numbers" },
        { status: 400 }
      );
    }

    if (awbList.length === 0) {
      return NextResponse.json(
        { error: "No AWB numbers provided" },
        { status: 400 }
      );
    }

    // Delete all matching AWBs
    const result = await EventActivity.deleteMany({ awbNo: { $in: awbList } });

    return NextResponse.json(
      {
        message: `✅ Deleted ${result.deletedCount} record(s)`,
        deletedAwbs: awbList,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error deleting POD entries:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
