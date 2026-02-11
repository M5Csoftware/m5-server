// app/api/portal/get-delivered-shipments/route.js (with date filter)
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import EventActivity from "@/app/model/EventActivity";

connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!accountCode) {
      return NextResponse.json(
        { message: "accountCode is required" },
        { status: 400 },
      );
    }

    // Build query for EventActivity
    let eventQuery = { status: "Shipment Delivered" };

    // Add date filter if provided
    if (startDate || endDate) {
      eventQuery.eventLogTime = {};
      if (startDate) {
        eventQuery.eventLogTime.$gte = new Date(startDate);
      }
      if (endDate) {
        eventQuery.eventLogTime.$lte = new Date(endDate);
      }
    }

    // Find delivered events
    const deliveredEvents = await EventActivity.find(eventQuery);

    if (deliveredEvents.length === 0) {
      return NextResponse.json({
        shipments: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
    }

    // Get unique AWB numbers
    const deliveredAwbs = [
      ...new Set(deliveredEvents.map((event) => event.awbNo)),
    ];

    // Fetch shipments for these AWBs
    const shipments = await Shipment.find({
      accountCode,
      awbNo: { $in: deliveredAwbs },
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Add delivery info
    const shipmentsWithDeliveryInfo = shipments.map((shipment) => {
      const deliveredEvent = deliveredEvents.find(
        (event) => event.awbNo === shipment.awbNo,
      );

      let deliveryDate = null;
      if (
        deliveredEvent &&
        deliveredEvent.eventLogTime &&
        deliveredEvent.eventLogTime.length > 0
      ) {
        deliveryDate = deliveredEvent.eventLogTime
          .filter((time) => time)
          .sort((a, b) => new Date(b) - new Date(a))[0];
      }

      return {
        ...shipment,
        status: "Delivered",
        deliveryDate: deliveryDate,
        receiverName: deliveredEvent?.receiverName || shipment.receiverFullName,
        deliveredEvent: {
          eventCode:
            deliveredEvent?.eventCode?.[deliveredEvent.eventCode.length - 1],
          eventDate:
            deliveredEvent?.eventDate?.[deliveredEvent.eventDate.length - 1],
          eventTime:
            deliveredEvent?.eventTime?.[deliveredEvent.eventTime.length - 1],
          remark: deliveredEvent?.remark,
        },
      };
    });

    const totalDeliveredShipments = await Shipment.countDocuments({
      accountCode,
      awbNo: { $in: deliveredAwbs },
    });

    return NextResponse.json({
      shipments: shipmentsWithDeliveryInfo,
      total: totalDeliveredShipments,
      page,
      limit,
      totalPages: Math.ceil(totalDeliveredShipments / limit),
      deliveredAwbsCount: deliveredAwbs.length,
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    console.error("Error fetching delivered shipments:", error);
    return NextResponse.json(
      { message: "Error fetching delivered shipments", error: error.message },
      { status: 500 },
    );
  }
}
