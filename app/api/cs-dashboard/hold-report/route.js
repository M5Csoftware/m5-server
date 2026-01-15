import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import dayjs from "dayjs";

function category(reason = "") {
  const r = reason.toLowerCase();

  if (!r.trim()) return "Without Reason";
  if (r.includes("bag")) return "Adv. Bagging";
  if (r.includes("amd") || r.includes("mum") || r.includes("del"))
    return "AMD/MUM-DEL";

  return "Reason Wise";
}

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = Number(searchParams.get("month")); // 0–11
    const year = Number(searchParams.get("year"));
    const origin = searchParams.get("origin");

    if (!origin) return NextResponse.json([], { status: 400 });

    const start = dayjs().year(year).month(month).startOf("month").toDate();
    const end = dayjs().year(year).month(month).endOf("month").toDate();

    console.log("HOLD REPORT QUERY →", {
      month,
      year,
      origin,
      start,
      end,
    });

    // hold shipments
    const holds = await Shipment.find({
      isHold: true,
      origin,
      date: { $gte: start, $lte: end },
    }).lean();

    // non-hold shipments
    const nonHolds = await Shipment.find({
      isHold: false,
      origin,
      date: { $gte: start, $lte: end },
    }).lean();

    // combine
    const map = {};

    // init row structure
    const emptyRow = (service) => ({
      Service: service,
      "Reason Wise": 0,
      "Without Reason": 0,
      "Adv. Bagging": 0,
      "AMD/MUM-DEL": 0,
      "Total W/O Hold": 0,
      "Total with Hold": 0, // key name matches frontend
    });

    // HOLD shipments
    holds.forEach((s) => {
      const service = s.service || "N/A";
      if (!map[service]) map[service] = emptyRow(service);

      const c = category(s.holdReason);
      map[service][c]++; // Reason Wise / Without Reason / Adv...
      map[service]["Total with Hold"]++; // ✅ only holds here
    });

    // NON-HOLD shipments
    nonHolds.forEach((s) => {
      const service = s.service || "N/A";
      if (!map[service]) map[service] = emptyRow(service);

      map[service]["Total W/O Hold"]++;
      // non-hold is ALSO part of total shipments:
    });

    return NextResponse.json(Object.values(map));
  } catch (err) {
    console.log(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
