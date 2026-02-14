// app/api/portal/get-delivered-shipments/route.js
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
    const type = searchParams.get("type");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "1000");

    if (!accountCode) {
      return NextResponse.json(
        { message: "accountCode is required" },
        { status: 400 }
      );
    }

    // Build date filter based on the tab type
    let shipmentDateFilter = {};
    
    if (type === "all" || type === "hold") {
      // For All and Hold tabs - filter by createdAt
      if (startDate || endDate) {
        shipmentDateFilter.createdAt = {};
        if (startDate) {
          shipmentDateFilter.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          shipmentDateFilter.createdAt.$lte = end;
        }
      }
    } else if (type === "latest") {
      // For Latest tab - always filter by today's date
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      shipmentDateFilter.createdAt = {
        $gte: todayStart,
        $lte: todayEnd
      };
    }

    let shipments = [];
    let total = 0;

    switch (type) {
      case "all":
        // Show ALL shipments for this account code
        const allQuery = { 
          accountCode, 
          ...shipmentDateFilter 
        };
        
        shipments = await Shipment.find(allQuery)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();
        
        total = await Shipment.countDocuments(allQuery);
        
        console.log(`All shipments: Found ${total} total, returning ${shipments.length}`);
        break;

      case "latest":
        // Show shipments created TODAY only
        const latestQuery = {
          accountCode,
          ...shipmentDateFilter
        };

        shipments = await Shipment.find(latestQuery)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();
        
        total = await Shipment.countDocuments(latestQuery);
        
        console.log(`Latest shipments: Found ${total} total, returning ${shipments.length}`);
        break;

      case "hold":
        // Show shipments where isHold is true
        const holdQuery = {
          accountCode,
          isHold: true,
          ...shipmentDateFilter
        };

        shipments = await Shipment.find(holdQuery)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();
        
        total = await Shipment.countDocuments(holdQuery);
        
        // Add status field for consistency
        shipments = shipments.map(s => ({ ...s, status: "Hold" }));
        
        console.log(`Hold shipments: Found ${total} total, returning ${shipments.length}`);
        break;

      case "intransit":
        // For In Transit - filter EventActivity by date
        let inTransitEventQuery = {
          status: { $in: ["In Transit", "Shipment In Transit", "In-Transit"] },
        };

        // Apply date filter to EventActivity if provided
        if (startDate || endDate) {
          inTransitEventQuery.eventLogTime = {};
          if (startDate) {
            inTransitEventQuery.eventLogTime.$gte = new Date(startDate);
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            inTransitEventQuery.eventLogTime.$lte = end;
          }
        }

        const inTransitEvents = await EventActivity.find(inTransitEventQuery).lean();
        const inTransitAwbs = [...new Set(inTransitEvents.map((event) => event.awbNo))];

        console.log(`In Transit: Found ${inTransitAwbs.length} unique AWBs from EventActivity`);

        if (inTransitAwbs.length > 0) {
          shipments = await Shipment.find({
            accountCode,
            awbNo: { $in: inTransitAwbs },
          })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

          // Add event info to shipments
          shipments = shipments.map((shipment) => {
            const event = inTransitEvents.find((e) => e.awbNo === shipment.awbNo);
            return {
              ...shipment,
              status: "In Transit",
              eventInfo: event
                ? {
                    eventCode: event.eventCode?.[event.eventCode.length - 1],
                    eventDate: event.eventDate?.[event.eventDate.length - 1],
                    eventTime: event.eventTime?.[event.eventTime.length - 1],
                    remark: event.remark,
                  }
                : null,
            };
          });

          total = await Shipment.countDocuments({
            accountCode,
            awbNo: { $in: inTransitAwbs },
          });
        }

        console.log(`In Transit shipments: Found ${total} total, returning ${shipments.length}`);
        break;

      case "rto":
        // For RTO - filter EventActivity by date
        let rtoEventQuery = {
          status: { $in: ["RTO", "Return to Origin", "RTO In Transit"] },
        };

        // Apply date filter to EventActivity if provided
        if (startDate || endDate) {
          rtoEventQuery.eventLogTime = {};
          if (startDate) {
            rtoEventQuery.eventLogTime.$gte = new Date(startDate);
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            rtoEventQuery.eventLogTime.$lte = end;
          }
        }

        const rtoEvents = await EventActivity.find(rtoEventQuery).lean();
        const rtoAwbs = [...new Set(rtoEvents.map((event) => event.awbNo))];

        console.log(`RTO: Found ${rtoAwbs.length} unique AWBs from EventActivity`);

        if (rtoAwbs.length > 0) {
          shipments = await Shipment.find({
            accountCode,
            awbNo: { $in: rtoAwbs },
          })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

          // Add event info to shipments
          shipments = shipments.map((shipment) => {
            const event = rtoEvents.find((e) => e.awbNo === shipment.awbNo);
            return {
              ...shipment,
              status: "RTO",
              eventInfo: event
                ? {
                    eventCode: event.eventCode?.[event.eventCode.length - 1],
                    eventDate: event.eventDate?.[event.eventDate.length - 1],
                    eventTime: event.eventTime?.[event.eventTime.length - 1],
                    remark: event.remark,
                  }
                : null,
            };
          });

          total = await Shipment.countDocuments({
            accountCode,
            awbNo: { $in: rtoAwbs },
          });
        }

        console.log(`RTO shipments: Found ${total} total, returning ${shipments.length}`);
        break;

      case "delivered":
        // For Delivered - filter EventActivity by date
        let deliveredEventQuery = {
          status: { $in: ["Shipment Delivered", "Delivered"] },
        };

        // Apply date filter to EventActivity if provided
        if (startDate || endDate) {
          deliveredEventQuery.eventLogTime = {};
          if (startDate) {
            deliveredEventQuery.eventLogTime.$gte = new Date(startDate);
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            deliveredEventQuery.eventLogTime.$lte = end;
          }
        }

        const deliveredEvents = await EventActivity.find(deliveredEventQuery).lean();
        const deliveredAwbs = [...new Set(deliveredEvents.map((event) => event.awbNo))];

        console.log(`Delivered: Found ${deliveredAwbs.length} unique AWBs from EventActivity`);

        if (deliveredAwbs.length > 0) {
          shipments = await Shipment.find({
            accountCode,
            awbNo: { $in: deliveredAwbs },
          })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

          // Add delivery info to shipments
          shipments = shipments.map((shipment) => {
            const deliveredEvent = deliveredEvents.find((e) => e.awbNo === shipment.awbNo);

            let deliveryDate = null;
            if (deliveredEvent?.eventLogTime?.length > 0) {
              const eventTimes = deliveredEvent.eventLogTime.filter(time => time);
              deliveryDate = eventTimes.length > 0 
                ? new Date(Math.max(...eventTimes.map(t => new Date(t).getTime())))
                : null;
            }

            return {
              ...shipment,
              status: "Delivered",
              deliveryDate: deliveryDate,
              receiverName: deliveredEvent?.receiverName || shipment.receiverFullName,
              deliveredEvent: {
                eventCode: deliveredEvent?.eventCode?.[deliveredEvent.eventCode.length - 1],
                eventDate: deliveredEvent?.eventDate?.[deliveredEvent.eventDate.length - 1],
                eventTime: deliveredEvent?.eventTime?.[deliveredEvent.eventTime.length - 1],
                remark: deliveredEvent?.remark,
              },
            };
          });

          total = await Shipment.countDocuments({
            accountCode,
            awbNo: { $in: deliveredAwbs },
          });
        }

        console.log(`Delivered shipments: Found ${total} total, returning ${shipments.length}`);
        break;

      default:
        return NextResponse.json(
          { message: "Invalid type parameter" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      shipments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      type,
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    console.error("Error fetching shipments:", error);
    return NextResponse.json(
      { message: "Error fetching shipments", error: error.message },
      { status: 500 }
    );
  }
}