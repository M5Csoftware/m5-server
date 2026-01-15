// app/api/dashboard/sales-dashboard/service-wise/route.js

import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import SalesTarget from "@/app/model/SalesTarget";
import { NextResponse } from "next/server";
import dayjs from "dayjs";

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId } = body;

    console.log("📍 Received userId:", userId);

    if (!userId) {
      return NextResponse.json(
        { message: "userId is required" },
        { status: 400 }
      );
    }

    // Get current month in YYYY-MM format
    const currentMonth = dayjs().format("YYYY-MM");
    console.log("📅 Current month:", currentMonth);

    // Find sales target for this user and month
    // Find sales target for this user (ignore month)
    const salesTarget = await SalesTarget.findOne({ userId });

    console.log("🎯 Sales Target found:", salesTarget ? "YES" : "NO");
    if (salesTarget) {
      console.log("📋 Sales Target details:", {
        userId: salesTarget.userId,
        month: salesTarget.month,
        customersCount: salesTarget.customersAssigned?.length || 0,
      });
    }

    // If no sales target, try to find for any month for this user
    if (!salesTarget) {
      const anyTarget = await SalesTarget.findOne({ userId });
      console.log("🔍 Any target for this user:", anyTarget ? "YES" : "NO");
      if (anyTarget) {
        console.log("📌 Found target for month:", anyTarget.month);
      }

      // Also check all sales targets to see what months exist
      const allTargets = await SalesTarget.find({}).limit(5);
      console.log(
        "📊 Sample targets in DB:",
        allTargets.map((t) => ({
          userId: t.userId,
          month: t.month,
        }))
      );
    }

    console.log(
      "👥 Customers assigned:",
      salesTarget?.customersAssigned?.length || 0
    );

    if (!salesTarget || !salesTarget.customersAssigned?.length) {
      console.log(
        "⚠️ No sales target or customers assigned - returning empty data"
      );
      return NextResponse.json({
        "Last 7 Days": [],
        "Last 30 Days": [],
        "Last Year": [],
        debug: {
          userId,
          currentMonth,
          targetFound: !!salesTarget,
          customersAssigned: salesTarget?.customersAssigned?.length || 0,
        },
      });
    }

    // Extract assigned account codes
    const assignedAccountCodes = salesTarget.customersAssigned.map(
      (c) => c.accountCode
    );

    console.log("🔑 Assigned account codes:", assignedAccountCodes);

    // Define date ranges
    const now = dayjs();
    const last7Days = now.subtract(7, "day").toDate();
    const last30Days = now.subtract(30, "day").toDate();
    const lastYear = now.subtract(1, "year").toDate();

    console.log("📆 Date ranges:", {
      last7Days: last7Days.toISOString(),
      last30Days: last30Days.toISOString(),
      lastYear: lastYear.toISOString(),
    });

    // Check if there are ANY shipments for these account codes
    const totalShipments = await Shipment.countDocuments({
      accountCode: { $in: assignedAccountCodes },
    });
    console.log("📦 Total shipments for assigned customers:", totalShipments);

    // Check shipments with service field
    const shipmentsWithService = await Shipment.countDocuments({
      accountCode: { $in: assignedAccountCodes },
      service: { $exists: true, $ne: "" },
    });
    console.log("🏷️ Shipments with service field:", shipmentsWithService);

    // Sample some shipments to see their structure
    const sampleShipments = await Shipment.find({
      accountCode: { $in: assignedAccountCodes },
    })
      .limit(3)
      .select("accountCode service totalAmt date");
    console.log("📋 Sample shipments:", sampleShipments);

    // Helper function to aggregate service data dynamically
    const getServiceData = async (startDate, label) => {
      const aggregation = await Shipment.aggregate([
        {
          $match: {
            accountCode: { $in: assignedAccountCodes },
            date: { $gte: startDate },
            service: { $exists: true, $ne: "" },
          },
        },
        {
          $group: {
            _id: "$service",
            totalAmount: { $sum: "$totalAmt" },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { totalAmount: -1 },
        },
      ]);

      console.log(`📊 ${label} aggregation results:`, aggregation);

      return aggregation.map((item) => ({
        label: item._id,
        value: Math.round(item.totalAmount),
      }));
    };

    // Fetch data for all ranges
    const [last7Data, last30Data, lastYearData] = await Promise.all([
      getServiceData(last7Days, "Last 7 Days"),
      getServiceData(last30Days, "Last 30 Days"),
      getServiceData(lastYear, "Last Year"),
    ]);

    console.log("✅ Final data:", {
      "Last 7 Days": last7Data,
      "Last 30 Days": last30Data,
      "Last Year": lastYearData,
    });

    return NextResponse.json({
      "Last 7 Days": last7Data,
      "Last 30 Days": last30Data,
      "Last Year": lastYearData,
    });
  } catch (error) {
    console.error("❌ Service-wise data error:", error);
    return NextResponse.json(
      {
        message: "Failed to fetch service-wise data",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
