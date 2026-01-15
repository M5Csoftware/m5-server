import connectDB from "@/app/lib/db";
import EventActivity from "@/app/model/EventActivity";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const awbNo = searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB No required" },
        { status: 400 }
      );
    }

    const event = await EventActivity.findOne({ awbNo }).lean();

    if (!event) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    const total = event.status?.length || 0;
    const lastIndex = total > 0 ? total - 1 : -1;

    // Latest status block
    const latestStatus = {
      status: lastIndex >= 0 ? event.status[lastIndex] : "",
      statusDate: event.updatedAt
        ? new Date(event.updatedAt).toISOString().split("T")[0]
        : "",
      time: event.updatedAt
        ? new Date(event.updatedAt).toISOString().split("T")[1]?.slice(0, 5)
        : "",
      receiverName: event.receiverName || "",
      remark: event.remark || "",
    };

    const normalizeTime = (t) => {
      if (!t) return "";

      // already HH:mm
      if (typeof t === "string" && /^\d{2}:\d{2}/.test(t)) {
        return t.slice(0, 5);
      }

      const d = new Date(t);
      if (isNaN(d)) return "";

      return d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    };

    const formatDDMMYYYY = (d) => {
      if (!d) return "";
      const dt = new Date(d);
      if (isNaN(dt)) return "";
      return dt.toLocaleDateString("en-GB"); // DD/MM/YYYY
    };

    // Web history table
    const history = Array.from({ length: total }, (_, i) => ({
      eventDate: formatDDMMYYYY(event.eventDate?.[i]),
      eventTime: normalizeTime(event.eventTime?.[i]),
      eventCode: event.eventCode?.[i] || "",
      status: event.status?.[i] || "",
      eventUser: event.eventUser?.[i] || "",
      eventLocation: event.eventLocation?.[i] || "",
      eventLogTime: normalizeTime(event.eventLogTime?.[i]),
    }));

    return NextResponse.json({
      success: true,
      data: {
        awbNo,
        latestStatus,
        history,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
