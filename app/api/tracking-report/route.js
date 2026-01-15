import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RunEntry from "@/app/model/RunEntry";
import Shipment from "@/app/model/portal/Shipment";
import Bagging from "@/app/model/bagging";
import Clubbing from "@/app/model/Clubbing";
import EventActivity from "@/app/model/EventActivity";
import AWBLog from "@/app/model/AWBLog";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const runNumber = searchParams.get("runNumber");
    const accountCode = searchParams.get("accountCode");
    const sector = searchParams.get("sector");
    const destination = searchParams.get("destination");
    const network = searchParams.get("network");
    const service = searchParams.get("service");
    const counterPart = searchParams.get("counterPart");

    // Build query for run entries
    let runQuery = {};

    // Date range filter
    if (fromDate && toDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      runQuery.date = { $gte: from, $lte: to };
    }

    // Run number filter
    if (runNumber) {
      runQuery.runNo = runNumber;
    }

    // Counterpart filter
    if (counterPart) {
      runQuery.counterpart = new RegExp(counterPart, "i");
    }

    // Sector filter
    if (sector) {
      runQuery.sector = new RegExp(`^${sector}$`, "i");
    }

    // Destination filter
    if (destination) {
      runQuery.destination = new RegExp(`^${destination}$`, "i");
    }

    // Fetch run entries
    const runEntries = await RunEntry.find(runQuery).lean();

    if (runEntries.length === 0) {
      return NextResponse.json([]);
    }

    // Extract run numbers
    const runNumbers = runEntries.map((run) => run.runNo);

    // Build shipment query
    let shipmentQuery = { runNo: { $in: runNumbers } };

    // Account code filter
    if (accountCode) {
      shipmentQuery.accountCode = accountCode;
    }

    // Network filter
    if (network) {
      shipmentQuery.network = new RegExp(`^${network}$`, "i");
    }

    // Service filter
    if (service) {
      shipmentQuery.service = new RegExp(`^${service}$`, "i");
    }

    // Fetch shipments
    const shipments = await Shipment.find(shipmentQuery).lean();

    if (shipments.length === 0) {
      return NextResponse.json([]);
    }

    // Get all AWB numbers
    const awbNumbers = shipments.map((s) => s.awbNo);

    // Fetch related data in parallel
    const [clubbingData, baggingData, eventActivityData, awbLogData] =
      await Promise.all([
        Clubbing.find({ awbNo: { $in: awbNumbers } }).lean(),
        Bagging.find({ runNo: { $in: runNumbers } }).lean(),
        EventActivity.find({ awbNo: { $in: awbNumbers } }).lean(),
        AWBLog.find({ awbNo: { $in: awbNumbers } }).lean(),
      ]);

    // Create lookup maps
    const runMap = new Map(runEntries.map((run) => [run.runNo, run]));
    const clubbingMap = new Map(clubbingData.map((club) => [club.awbNo, club]));
    const eventActivityMap = new Map(
      eventActivityData.map((event) => [event.awbNo, event])
    );
    const awbLogMap = new Map(awbLogData.map((log) => [log.awbNo, log]));

    // Create bagging map (need to process rowData)
    const baggingMap = new Map();
    baggingData.forEach((bagging) => {
      if (bagging.rowData && Array.isArray(bagging.rowData)) {
        bagging.rowData.forEach((row) => {
          if (row.awbNo) {
            baggingMap.set(row.awbNo, {
              bagNo: row.bagNo,
              bagWeight: row.bagWeight,
              ...row,
            });
          }
        });
      }
    });

    // Combine all data
    const combinedData = shipments.map((shipment) => {
      const runEntry = runMap.get(shipment.runNo);
      const clubbing = clubbingMap.get(shipment.awbNo);
      const bagging = baggingMap.get(shipment.awbNo);
      const eventActivity = eventActivityMap.get(shipment.awbNo);
      const awbLog = awbLogMap.get(shipment.awbNo);

      // Get unhold date from AWB logs
      let unholdDate = "";
      if (awbLog && awbLog.logs && Array.isArray(awbLog.logs)) {
        const unholdLog = awbLog.logs.find(
          (log) => log.action && log.action.toLowerCase().includes("unhold")
        );
        if (unholdLog && unholdLog.actionLogDate) {
          unholdDate = new Date(unholdLog.actionLogDate).toLocaleDateString();
        }
      }

      // Get delivery date and remarks from event activity
      let deliveryDate = "";
      let deliveryRemarks = "";
      if (eventActivity) {
        // Find the last delivery event
        if (eventActivity.status && Array.isArray(eventActivity.status)) {
          const deliveryIndex = eventActivity.status.findLastIndex(
            (status) => status && status.toLowerCase().includes("deliver")
          );
          if (deliveryIndex !== -1) {
            if (
              eventActivity.eventDate &&
              eventActivity.eventDate[deliveryIndex]
            ) {
              deliveryDate = eventActivity.eventDate[deliveryIndex];
            }
          }
        }
        deliveryRemarks = eventActivity.remark || "";
      }

      // Get current status
      let status = "";
      if (
        eventActivity &&
        eventActivity.status &&
        Array.isArray(eventActivity.status)
      ) {
        status = eventActivity.status[eventActivity.status.length - 1] || "";
      }

      return {
        runNo: shipment.runNo || "",
        awbNo: shipment.awbNo || "",
        mawbNo: shipment.alMawb || runEntry?.almawb || "",
        clubNo: clubbing?.clubNo || "",
        customerCode: shipment.accountCode || "",
        destination: shipment.destination || "",
        pcs: shipment.pcs || "",
        actWeight: shipment.totalActualWt || "",
        bagWeight: bagging?.bagWeight || "",
        serviceType: shipment.service || "",
        bagNo: bagging?.bagNo || "",
        forwarder: shipment.forwarder || "",
        forwardingNo: shipment.forwardingNo || "",
        status: status,
        network: shipment.network || "",
        counterPart: runEntry?.counterpart || "",
        bookingDate: shipment.date
          ? new Date(shipment.date).toLocaleDateString()
          : "",
        unholdDate: unholdDate,
        flightDate: runEntry?.date
          ? new Date(runEntry.date).toLocaleDateString()
          : "",
        landingDate: "", // To be entered manually
        dateOfConnections: "", // To be entered manually
        // deliveryDate: deliveryDate,
        // deliveryRemarks: deliveryRemarks
      };
    });

    return NextResponse.json(combinedData);
  } catch (error) {
    console.error("Error in tracking report API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
