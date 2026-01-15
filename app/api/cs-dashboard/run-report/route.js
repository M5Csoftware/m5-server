import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import dayjs from "dayjs";
import RunEntry from "@/app/model/RunEntry";
import Bagging from "@/app/model/bagging";
import RunProcess from "@/app/model/RunProcess";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = Number(searchParams.get("month"));
    const year = Number(searchParams.get("year"));
    const hub = searchParams.get("hub");

    if (!hub) return NextResponse.json([], { status: 400 });

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59);

    // RUN ENTRIES
    const runs = await RunEntry.find({
      hub,
      date: { $gte: start, $lte: end },
    })
      .select("date runNo sector")
      .lean();

    if (!runs.length) return NextResponse.json([]);

    const runNos = runs.map((r) => r.runNo);

    // BAGGING
    const bagging = await Bagging.find({ runNo: { $in: runNos } })
      .select("runNo noOfBags runWeight")
      .lean();

    const bagMap = {};
    bagging.forEach((b) => {
      bagMap[b.runNo] = {
        bags: b.noOfBags || 0,
        weight: b.runWeight || 0,
      };
    });

    // PRE-ALERT
    const tracking = await RunProcess.find({
      runNo: { $in: runNos },
    })
      .select("runNo currentStatus statusHistory")
      .lean();

    const preAlertMap = {};
    tracking.forEach((t) => {
      const history = t.statusHistory || [];
      const hasPreAlert =
        t.currentStatus === "Pre-Alert" ||
        history.some((h) => h.status === "Pre-Alert");

      preAlertMap[t.runNo] = hasPreAlert ? "Done" : "Pending";
    });

    // FINAL OUTPUT
    const final = runs.map((r) => {
      const bags = bagMap[r.runNo]?.bags ?? 0;
      const weight = bagMap[r.runNo]?.weight ?? 0;
      const sector = r.sector || "-";
      const preAlert = preAlertMap[r.runNo] || "Pending";

      return {
        "Flight Date": dayjs(r.date).format("DD/MM/YYYY"),
        Sector: sector,
        "Run Number": r.runNo,
        BAG: bags,
        Weight: weight,
        "Pre-Alert": preAlert,
      };
    });

    return NextResponse.json(final);
  } catch (err) {
    console.error("❌ RUN REPORT ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
