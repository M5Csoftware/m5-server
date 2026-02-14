// app/api/portal/shipment-analytics/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

// Ensure DB connection
connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");
    const duration = searchParams.get("duration") || "12 Months";

    if (!accountCode) {
      return NextResponse.json(
        { message: "accountCode is required" },
        { status: 400 },
      );
    }

    // Calculate date range based on duration
    const now = new Date();
    let startDate;
    let groupByFormat;
    let dateLabels = [];

    switch (duration) {
      case "30 Days":
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 30,
        );
        groupByFormat = "day";
        // Generate last 30 days labels
        for (let i = 29; i >= 0; i--) {
          const date = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - i,
          );
          dateLabels.push({
            label: `${date.getDate()}/${date.getMonth() + 1}`,
            month: date.getMonth(),
            day: date.getDate(),
            year: date.getFullYear(),
          });
        }
        break;
      case "6 Months":
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        groupByFormat = "month";
        // Generate last 6 months labels
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          dateLabels.push({
            label: date.toLocaleString("default", { month: "short" }),
            month: date.getMonth(),
            year: date.getFullYear(),
          });
        }
        break;
      case "12 Months":
      default:
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        groupByFormat = "month";
        // Generate last 12 months labels
        for (let i = 11; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          dateLabels.push({
            label: date.toLocaleString("default", { month: "short" }),
            month: date.getMonth(),
            year: date.getFullYear(),
          });
        }
        break;
    }

    // Fetch shipments within date range
    const shipments = await Shipment.find({
      accountCode,
      date: { $gte: startDate },
    }).select("date receiverCountry status");

    // Group shipments by time period and country
    const groupedData = {};
    const countrySet = new Set();

    dateLabels.forEach((dateLabel) => {
      groupedData[dateLabel.label] = { name: dateLabel.label };
    });

    shipments.forEach((shipment) => {
      const shipmentDate = new Date(shipment.date);
      let periodKey;

      if (groupByFormat === "day") {
        const matchingLabel = dateLabels.find(
          (dl) =>
            dl.day === shipmentDate.getDate() &&
            dl.month === shipmentDate.getMonth() &&
            dl.year === shipmentDate.getFullYear(),
        );
        periodKey = matchingLabel?.label;
      } else {
        // month
        const matchingLabel = dateLabels.find(
          (dl) =>
            dl.month === shipmentDate.getMonth() &&
            dl.year === shipmentDate.getFullYear(),
        );
        periodKey = matchingLabel?.label;
      }

      if (periodKey && groupedData[periodKey]) {
        // Get country - normalize it
        let country = shipment.receiverCountry || "Unknown";
        country = country.trim();

        // Map common country variations
        const countryMapping = {
          USA: "USA",
          "United States": "USA",
          US: "USA",
          "United Kingdom": "UK",
          UK: "UK",
          Britain: "UK",
          Australia: "Australia",
          Canada: "Canada",
          "New Zealand": "New Zealand",
          NZ: "New Zealand",
          // Add more European countries
          Germany: "Europe",
          France: "Europe",
          Italy: "Europe",
          Spain: "Europe",
          Netherlands: "Europe",
          Belgium: "Europe",
          Switzerland: "Europe",
          Austria: "Europe",
          Sweden: "Europe",
          Norway: "Europe",
          Denmark: "Europe",
          Finland: "Europe",
          Poland: "Europe",
          Portugal: "Europe",
          Greece: "Europe",
          Ireland: "Europe",
        };

        country = countryMapping[country] || country;

        countrySet.add(country);
        groupedData[periodKey][country] =
          (groupedData[periodKey][country] || 0) + 1;
      }
    });

    // Convert to array format for recharts
    const chartData = dateLabels.map((dl) => groupedData[dl.label]);

    // Calculate statistics
    const stats = {
      total: shipments.length,
      delivered: shipments.filter(
        (s) => s.status && s.status.toLowerCase().includes("deliver"),
      ).length,
      pending: shipments.filter(
        (s) =>
          s.status &&
          (s.status.toLowerCase().includes("pending") ||
            s.status.toLowerCase().includes("transit") ||
            s.status.toLowerCase().includes("progress")),
      ).length,
      rto: shipments.filter(
        (s) => s.status && s.status.toLowerCase().includes("rto"),
      ).length,
    };

    // Get list of countries for the chart
    const countries = Array.from(countrySet).sort();

    return NextResponse.json({
      success: true,
      data: chartData,
      countries,
      stats,
      duration,
      startDate,
      endDate: now,
    });
  } catch (error) {
    console.error("Error fetching shipment analytics:", error);
    return NextResponse.json(
      { message: "Error fetching analytics", error: error.message },
      { status: 500 },
    );
  }
}
