import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import Shipment from "@/app/model/portal/Shipment";
import SalesTarget from "@/app/model/SalesTarget";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const hub = searchParams.get("hub");
    const month = searchParams.get("month");

    // Employee filter
    const employeeFilter = {};
    if (hub && hub !== "Hub") employeeFilter.hub = hub;

    // Date filter
    let dateFilter = {};
    if (month) {
      const [year, mon] = month.split("-");

      const start = new Date(year, mon - 1, 1);
      const end = new Date(year, mon, 0, 23, 59, 59);

      dateFilter = { date: { $gte: start, $lte: end } };
    }

    // 1) Employees of that hub
    const employees = await Employee.find(
      employeeFilter,
      "userId userName hub"
    );
    const allowedUserIds = employees.map((e) => e.userId);

    // 2) Targets belonging to these employees
    const targets = await SalesTarget.find(
      hub ? { userId: { $in: allowedUserIds } } : {}
    );

    const result = [];

    for (const t of targets) {
      const assignedCodes = t.customersAssigned.map((c) => c.accountCode);

      // 3) Shipments filtered by month & customer codes
      const shipments = await Shipment.find({
        accountCode: { $in: assignedCodes },
        ...dateFilter,
      });

      const totalProgress = shipments.reduce(
        (sum, s) => sum + (s.totalAmt || 0),
        0
      );

      result.push({
        name: t.userName,
        code: t.stateAssigned,
        target: t.targetAmount,
        progress: totalProgress,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.log("sales target error:", err);
    return NextResponse.json({ message: "error" }, { status: 500 });
  }
}
