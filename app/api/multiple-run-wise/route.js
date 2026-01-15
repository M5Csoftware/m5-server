import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import RunEntry from "@/app/model/RunEntry";
import CustomerAccount from "@/app/model/CustomerAccount";
import EventActivity from "@/app/model/EventActivity";
import ChildShipment from "@/app/model/portal/ChildShipment";

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      runNumbers = [],
      accountCode = "",
      branch = "",
      origin = "",
      sector = "",
      destination = "",
      network = "",
      counterPart = "",
      from = "",
      to = "",
      page = 1,
      itemsPerPage = 30,
      fetchCustomerName = false,
    } = body;

    // If fetchCustomerName is true, just return the customer name
    if (fetchCustomerName && accountCode) {
      const customer = await CustomerAccount.findOne(
        { accountCode: accountCode },
        { name: 1 }
      ).lean();

      return NextResponse.json({
        success: true,
        customerName: customer?.name || "",
      });
    }

    // Build filter object
    const filter = {};

    // 🔹 Collect runNos matching counterpart (from RunEntry)
    let runNosFromCounterPart = [];

    if (counterPart) {
      const runs = await RunEntry.find(
        { counterpart: new RegExp(counterPart, "i") },
        { runNo: 1 }
      ).lean();

      runNosFromCounterPart = runs.map((r) => r.runNo);
    }

    // Add run numbers filter
    const finalRunNos = [...(runNumbers || []), ...runNosFromCounterPart];

    if (finalRunNos.length > 0) {
      filter.runNo = { $in: [...new Set(finalRunNos)] };
    }

    // Add accountCode filter
    if (accountCode) {
      filter.accountCode = accountCode;
    }

    // Add other filters
    if (branch) {
      filter.branch = branch;
    }

    if (origin) {
      filter.origin = origin;
    }

    if (sector) {
      filter.sector = new RegExp(sector, "i");
    }

    if (destination) {
      filter.destination = new RegExp(destination, "i");
    }

    if (network) {
      filter.network = new RegExp(network, "i");
    }

    // Date range filter
    if (from || to) {
      filter.date = {};
      if (from) {
        filter.date.$gte = new Date(from);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.date.$lte = toDate;
      }
    }

    // Get total count for pagination
    const totalCount = await Shipment.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / itemsPerPage);

    // Calculate skip for pagination
    const skip = (page - 1) * itemsPerPage;

    // Fetch shipments with filters and pagination
    const shipments = await Shipment.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(itemsPerPage)
      .lean();

    // Helper function to format date as DD-MM-YYYY for display
    const formatDateForDisplay = (dateString) => {
      if (!dateString) return "";

      let date;

      if (typeof dateString === "string") {
        // Handle YYYY-MM-DD format or ISO format
        date = new Date(dateString);
      } else if (dateString instanceof Date) {
        date = dateString;
      } else {
        return "";
      }

      // Validate the date
      if (isNaN(date.getTime())) return "";

      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();

      return `${day}-${month}-${year}`;
    };

    // Map shipments to table format
    const tableData = await Promise.all(
      shipments.map(async (shipment) => {
        // Get event activity data
        const eventActivity = await EventActivity.findOne(
          { awbNo: shipment.awbNo },
          { eventCode: 1, eventDate: 1, eventTime: 1, status: 1, remark: 1 }
        ).lean();

        // Get run data
        const run = await RunEntry.findOne(
          { runNo: shipment.runNo },
          {
            runNo: 1,
            counterpart: 1,
            flight: 1,
            flightnumber: 1,
            date: 1,
            destination: 1,
          }
        ).lean();

        // Get customer data
        const customer = await CustomerAccount.findOne(
          { accountCode: shipment.accountCode },
          { name: 1 }
        ).lean();

        // Get child shipment data - check if shipment.awbNo is a masterAwbNo
        const childShipment = await ChildShipment.findOne(
          { masterAwbNo: shipment.awbNo },
          { childAwbNo: 1 }
        ).lean();

        // Extract last event info
        const lastEventIndex = eventActivity
          ? eventActivity.status.length - 1
          : -1;
        const lastStatus =
          lastEventIndex >= 0
            ? eventActivity.status[lastEventIndex]
            : shipment.status;
        const lastEventDate =
          lastEventIndex >= 0 ? eventActivity.eventDate[lastEventIndex] : null;
        const lastEventTime =
          lastEventIndex >= 0 ? eventActivity.eventTime[lastEventIndex] : null;
        const lastRemark =
          eventActivity && eventActivity.remark ? eventActivity.remark : "";

        // If shipment.awbNo matches masterAwbNo, show the childAwbNo
        const childAwb = childShipment?.childAwbNo || "";

        return {
          runNo: run?.runNo || shipment.runNo || "",
          awbNo: shipment.awbNo || "",
          masterAwbNo: childAwb,
          name: customer?.name || shipment.shipperFullName || "",
          destination: shipment.destination || "",
          counterpart: run?.counterpart || "",
          flight: run?.flight || run?.flightnumber || "",
          bookingDate: shipment.date ? formatDateForDisplay(shipment.date) : "",
          flightDate: run?.date ? formatDateForDisplay(run.date) : "",
          landlingDate: "",
          dateOfConnections: "",
          receiverFullName: shipment.receiverFullName || "",
          pcs: shipment.pcs || 0,
          totalActualWt: shipment.totalActualWt || 0,
          service: shipment.service || "",
          bag: shipment.bag || "",
          forwarder: shipment.forwarder || "",
          forwardingNo: shipment.forwardingNo || "",
          status: lastStatus || "",
          eventDate: lastEventDate ? formatDateForDisplay(lastEventDate) : "",
          eventTime: lastEventTime || "",
          remark: lastRemark,
          caseType: "",
          exceptionRemarks: "",
          exceptionMail: "",
          caseRegisterDate: "",
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: tableData,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        itemsPerPage: itemsPerPage,
        totalCount: totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching multiple run wise data:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
