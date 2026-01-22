// app/api/cs-dashboard/total-runs/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Run from "@/app/model/RunEntry";

await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "Today";
    const download = searchParams.get("download") === "true";

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);

    let query = {};
    let label = "";

    switch (range) {
      case "Today":
        query = { date: { $gte: todayStart, $lt: todayEnd } };
        label = "Today";
        break;
      case "Yesterday":
        query = { date: { $gte: yesterdayStart, $lt: yesterdayEnd } };
        label = "Yesterday";
        break;
      case "Last 7 Days":
        const sevenDaysAgo = new Date(todayStart);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        query = { date: { $gte: sevenDaysAgo, $lt: todayEnd } };
        label = "Last 7 Days";
        break;
      case "Last 30 Days":
        const thirtyDaysAgo = new Date(todayStart);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = { date: { $gte: thirtyDaysAgo, $lt: todayEnd } };
        label = "Last 30 Days";
        break;
      default:
        query = { date: { $gte: todayStart, $lt: todayEnd } };
        label = "Today";
    }

    const runs = await Run.find(query).sort({ date: -1 });

    if (download) {
      // Return full data for Excel download
      return NextResponse.json({
        runs,
        count: runs.length,
        range: label,
      });
    }

    // Return count only for card display
    return NextResponse.json({
      count: runs.length,
      range: label,
    });
  } catch (error) {
    console.error("GET Total Runs Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}