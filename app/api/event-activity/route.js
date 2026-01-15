import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import EventActivity from "@/app/model/EventActivity";
import Shipment from "@/app/model/portal/Shipment"; // Import Shipment model

await connectDB();

export async function POST(req) {
  try {
    const body = await req.json();
    console.log("Incoming Data:", body);

    let data = [];

    // Handle different data formats
    if (typeof body === "object" && !Array.isArray(body)) {
      if (
        body.event_activitiesTable &&
        Array.isArray(body.event_activitiesTable)
      ) {
        data = body.event_activitiesTable;
      } else if (Object.keys(body).every((key) => !isNaN(key))) {
        data = Object.values(body);
      } else if (body.awbNo) {
        data = [body];
      }
    } else if (Array.isArray(body)) {
      data = body;
    }

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        {
          error:
            "Request body must be a non-empty array or a valid event object",
        },
        { status: 400 }
      );
    }

    const savedEvents = [];
    const updatedShipments = [];

    for (const event of data) {
      const {
        awbNo,
        eventCode,
        eventDate,
        eventTime,
        status,
        eventUser,
        eventLocation,
      } = event;

      if (!awbNo) {
        console.warn("Skipping event without awbNo:", event);
        continue;
      }

      // ✅ FIX: Properly handle date conversion
      const parseDate = (dateInput) => {
        if (!dateInput) return new Date();
        
        // If it's already a Date object
        if (dateInput instanceof Date) return dateInput;
        
        // If it's a valid date string
        if (typeof dateInput === 'string') {
          // Handle DD/MM/YYYY format
          if (dateInput.includes('/')) {
            const [day, month, year] = dateInput.split('/');
            return new Date(`${year}-${month}-${day}`);
          }
          
          // Try standard date parsing
          const parsed = new Date(dateInput);
          if (!isNaN(parsed.getTime())) return parsed;
        }
        
        // Fallback to current date
        return new Date();
      };

      const existingEvent = await EventActivity.findOne({ awbNo });

      if (existingEvent) {
        // Append history
        const updatedEvent = await EventActivity.findOneAndUpdate(
          { awbNo },
          {
            $push: {
              eventCode: eventCode || "",
              eventDate: parseDate(eventDate), // ✅ Use parsed date
              eventTime: eventTime || "",
              status: status || "",
              eventUser: eventUser || "",
              eventLocation: eventLocation || "",
              eventLogTime: new Date(),
            },
          },
          { new: true, runValidators: true }
        );

        savedEvents.push(updatedEvent);
        console.log(`✅ Updated AWB ${awbNo} with new history entry`);
      } else {
        // Create new with array
        const newEvent = await EventActivity.create({
          awbNo,
          eventCode: [eventCode || ""],
          eventDate: [parseDate(eventDate)], // ✅ Use parsed date
          eventTime: [eventTime || ""],
          status: [status || ""],
          eventUser: [eventUser || ""],
          eventLocation: [eventLocation || ""],
          eventLogTime: [new Date()],
        });

        savedEvents.push(newEvent);
        console.log(`🆕 Created new AWB record: ${awbNo}`);
      }

      // ✅ UPDATE SHIPMENT STATUS
      try {
        let shipment = await Shipment.findOne({ awbNo });
        
        if (shipment) {
          // Update existing shipment status
          shipment.status = status || "Updated"; // Use event status or default
          shipment.updatedAt = new Date();
          
          const updatedShipment = await shipment.save();
          updatedShipments.push(updatedShipment);
          console.log(`✅ Updated Shipment status for AWB: ${awbNo} to "${status}"`);
        } else {
          // Create new shipment if doesn't exist
          shipment = new Shipment({
            awbNo,
            status: status || "Updated",
            // Add other shipment fields if available from event data
            eventDate: parseDate(eventDate),
            eventLocation: eventLocation || "",
            eventUser: eventUser || "",
          });
          
          const newShipment = await shipment.save();
          updatedShipments.push(newShipment);
          console.log(`🆕 Created new Shipment for AWB: ${awbNo} with status "${status}"`);
        }
      } catch (shipmentError) {
        console.error(`❌ Error updating shipment for AWB ${awbNo}:`, shipmentError);
        // Continue with next AWB even if shipment update fails
      }
    }

    return NextResponse.json(
      {
        message: `Successfully processed ${savedEvents.length} event(s) and updated ${updatedShipments.length} shipment(s)`,
        data: savedEvents,
        shipmentsUpdated: updatedShipments.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ Error saving events:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// 📌 GET: Fetch by AWB or all
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const awbNo = url.searchParams.get("awbNo");

    let events;
    if (awbNo) {
      // Use findOne for single document
      events = await EventActivity.findOne({ awbNo });
      if (!events) {
        return NextResponse.json(
          { error: "No event activity found for this AWB number" },
          { status: 404 }
        );
      }
    } else {
      // Use find for multiple documents
      events = await EventActivity.find({});
      if (!events.length) {
        return NextResponse.json(
          { error: "No event activities found" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(events, { status: 200 });
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}