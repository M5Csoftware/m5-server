// app/api/offload-shipment/update-event/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import EventActivity from "@/app/model/EventActivity";
import Shipment from "@/app/model/portal/Shipment";
import OffloadShipment from "@/app/model/OffloadShipment";

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { shipments, alertOnEmail, alertOnPortal, updateInEvents } = body;

    // Validation
    if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments provided" },
        { status: 400 }
      );
    }

    const results = {
      successful: 0,
      failed: 0,
      total: shipments.length,
      errors: [],
    };

    const currentDate = new Date();
    const currentTime = currentDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    // Process each shipment
    for (const shipment of shipments) {
      try {
        const { awbNo, offloadReason, accountCode, customerName, email } =
          shipment;

        // Validate required fields
        if (!awbNo || !offloadReason || !accountCode || !customerName || !email) {
          results.failed++;
          results.errors.push({
            awbNo: awbNo || "Unknown",
            error: "Missing required fields",
          });
          continue;
        }

        // 1. Save to OffloadShipment collection
        const offloadShipment = new OffloadShipment({
          awbNo,
          offloadReason,
          accountCode,
          customerName,
          email,
          alertOnEmail: alertOnEmail || false,
          alertOnPortal: alertOnPortal || false,
          updatedInEvents: updateInEvents || false,
          offloadUser: "System", // Default user since no auth
          offloadDate: currentDate,
          offloadTime: currentTime,
          status: "Offloaded",
        });

        await offloadShipment.save();

        // 2. If updateInEvents is checked, update EventActivity and Shipment
        if (updateInEvents) {
          // Find existing event activity
          let eventActivity = await EventActivity.findOne({ awbNo });

          if (eventActivity) {
            // Update existing event activity by pushing new values to arrays
            eventActivity.eventCode.push("OFFLOAD");
            eventActivity.eventDate.push(currentDate);
            eventActivity.eventTime.push(currentTime);
            eventActivity.status.push("Shipment Offloaded");
            eventActivity.eventUser.push("System");
            eventActivity.eventLocation.push("");
            eventActivity.eventLogTime.push(currentDate);

            // Update remark with offload reason
            if (offloadReason) {
              eventActivity.remark = offloadReason;
            }

            await eventActivity.save();
          } else {
            // Create new event activity
            eventActivity = new EventActivity({
              awbNo,
              eventCode: ["OFFLOAD"],
              eventDate: [currentDate],
              eventTime: [currentTime],
              status: ["Shipment Offloaded"],
              eventUser: ["System"],
              eventLocation: [""],
              eventLogTime: [currentDate],
              remark: offloadReason,
            });

            await eventActivity.save();
          }

          // 3. Update Shipment status
          const shipmentUpdate = await Shipment.findOneAndUpdate(
            { awbNo },
            {
              status: "Shipment Offloaded",
              operationRemark: offloadReason,
              updateUser: "System",
            },
            { new: true }
          );

          if (!shipmentUpdate) {
            console.warn(`Shipment not found for AWB: ${awbNo}`);
            // Still count as successful since offload record and event were created
          }
        }

        results.successful++;
      } catch (error) {
        console.error(`Error processing AWB ${shipment.awbNo}:`, error);
        results.failed++;
        results.errors.push({
          awbNo: shipment.awbNo,
          error: error.message,
        });
      }
    }

    // Determine response message
    let message = "";
    if (results.failed === 0) {
      message = `Successfully processed ${results.successful} shipment(s)`;
    } else {
      message = `Processed ${results.successful} shipment(s), ${results.failed} failed`;
    }

    return NextResponse.json({
      success: results.successful > 0,
      message,
      results,
    });
  } catch (error) {
    console.error("Error processing offload shipments:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to process offload shipments",
        error: error.message,
      },
      { status: 500 }
    );
  }
}