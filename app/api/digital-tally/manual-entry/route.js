import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import DigitalTally from "@/app/model/DigitalTally";
import Shipment from "@/app/model/portal/Shipment";
import EventActivity from "@/app/model/EventActivity";
import { logAWB } from "@/app/lib/logAwb";

export async function POST(req) {
  try {
    await connectDB();
    const data = await req.json();

    // ✅ GET USER FROM BODY - inscanUser and inscanUserName are sent from frontend
    const entryUser = data.inscanUser || "Unknown";
    const entryUserName = data.inscanUserName || "Unknown";

    // ✅ Get IP
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("remote_addr") ||
      "unknown";

    console.log("👤 Entry User:", entryUser, entryUserName); // DEBUG
    console.log("📍 IP:", ip); // DEBUG

    if (!data || !Array.isArray(data.tableData)) {
      return NextResponse.json(
        { error: "Invalid payload: tableData missing" },
        { status: 400 }
      );
    }

    const rows = data.tableData;
    const savedEntries = [];
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString("en-GB");
    const formattedTime = currentDate.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    for (const row of rows) {
      const actWgt = row.actWgt ? Number(row.actWgt) : null;
      const volwgt = row.volwgt ? Number(row.volwgt) : null;

      const entryPayload = {
        entryType: "Manual",
        cdNumber: row.cdNumber || data.cdNumber || null,
        client: row.client || data.client || null,
        code: row.code || data.code || null,
        email: row.email || data.email || null,
        phoneNumber: row.phoneNumber || data.phoneNumber || null,
        hubName: data.hubName || null,
        hubCode: data.hubCode || null,
        statusDate: data.statusDate || formattedDate,
        time: data.time || formattedTime,
        remarks: data.remarks || null,
        hold: data.status === "Hold" || !!row["Hold Reason"],
        holdReason: row["Hold Reason"] || null,
        mawbNumber: row.mawbNumber || null,
        actualWeight: actWgt,
        volWeight: volwgt,
        service: row.service || null,
        result: row.result || null,
        baggingTable: row.baggingTable || [],
        // ✅ CORRECTLY SET inscanUser and inscanUserName
        inscanUser: entryUser,
        inscanUserName: entryUserName,
      };

      console.log("💾 Saving to DigitalTally:", entryPayload); // DEBUG

      const saved = await new DigitalTally(entryPayload).save();
      savedEntries.push(saved);

      console.log("✅ Saved DigitalTally entry:", {
        id: saved._id,
        inscanUser: saved.inscanUser,
        inscanUserName: saved.inscanUserName,
      });

      // ✅ SAVE TO EVENT ACTIVITY
      if (row.mawbNumber) {
        const eventCode = "OGH";
        const status =
          data.status === "Hold" ? "Hold" : "Arrived at Origin Gateway Hub";
        const eventLocation = data.hubName || "Unknown Hub";

        console.log("📝 Saving to EventActivity:", {
          awbNo: row.mawbNumber,
          eventCode,
          status,
          eventLocation,
          entryUser,
        });

        // Find existing EventActivity or create new one
        let eventActivity = await EventActivity.findOne({
          awbNo: row.mawbNumber,
        });

        if (eventActivity) {
          // Update existing document by pushing new values to arrays
          await EventActivity.updateOne(
            { awbNo: row.mawbNumber },
            {
              $push: {
                eventCode: eventCode,
                eventDate: currentDate,
                eventTime: formattedTime,
                status: status,
                eventUser: entryUser,
                eventLocation: eventLocation,
                eventLogTime: currentDate,
              },
            }
          );
        } else {
          // Create new EventActivity document
          eventActivity = new EventActivity({
            awbNo: row.mawbNumber,
            eventCode: [eventCode],
            eventDate: [currentDate],
            eventTime: [formattedTime],
            status: [status],
            eventUser: [entryUser],
            eventLocation: [eventLocation],
            eventLogTime: [currentDate],
            remark: data.remarks || null,
            receiverName: row.client || data.client || null,
          });
          await eventActivity.save();
        }

        console.log("✅ EventActivity saved/updated for AWB:", row.mawbNumber);
      }

      // ✅ LOG AWB with correct data
      if (row.mawbNumber) {
        console.log("📤 Logging AWB:", {
          awbNo: row.mawbNumber,
          actionUser: entryUser,
          accountCode: row.code || data.code,
          customerName: row.client || data.client,
        });

        await logAWB({
          awbNo: row.mawbNumber,
          action: "Digital Tally - Manual Entry",
          actionUser: entryUser,
          accountCode: row.code || data.code,
          customerName: row.client || data.client,
          department: "Booking",
          ip,
          meta: {
            hold: entryPayload.hold,
            holdReason: entryPayload.holdReason,
            eventCode: "OGH",
            status:
              data.status === "Hold" ? "Hold" : "Arrived at Origin Gateway Hub",
          },
        });
      }

      // Update Shipment
      if (row.mawbNumber) {
        try {
          const updateData = entryPayload.hold
            ? {
                status: "Hold",
                holdReason: entryPayload.holdReason,
                operationRemark: entryPayload.remarks,
              }
            : {
                status: "Arrived at Hub",
                eventCode: "OGH",
                eventLocation: data.hubName,
              };

          await Shipment.updateOne(
            { awbNo: row.mawbNumber },
            { $set: updateData }
          );
        } catch (err) {
          console.warn(
            "Shipment update failed for",
            row.mawbNumber,
            err.message
          );
        }
      }
    }

    return NextResponse.json(
      {
        message: "Manual entry saved and EventActivity updated",
        savedEntries,
        eventActivity: {
          eventCode: "OGH",
          status:
            data.status === "Hold" ? "Hold" : "Arrived at Origin Gateway Hub",
          entriesCount: rows.length,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error saving manual entry:", error.message, error.stack);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const entries = await DigitalTally.find({ entryType: "Manual" }).sort({
      createdAt: -1,
    });
    return NextResponse.json(entries);
  } catch (error) {
    console.error("Error fetching manual entries:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    const { ids } = await req.json();
    await DigitalTally.deleteMany({ _id: { $in: ids }, entryType: "Manual" });
    return NextResponse.json({
      message: "Manual entries deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting manual entries:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
