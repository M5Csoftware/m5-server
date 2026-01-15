import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import Shipment from "@/app/model/portal/Shipment";
import SalesTarget from "@/app/model/SalesTarget";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const hub = searchParams.get("hub");

    // Month formatting (YYYY-MM → "November-2025")
    let formattedMonth = null;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const monthName = new Date(y, m - 1, 1).toLocaleString("en-US", {
        month: "long",
      });
      formattedMonth = `${monthName}-${y}`;
    }

    // Date filter for Shipment.date
    let dateFilter = {};
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      dateFilter = { date: { $gte: start, $lte: end } };
    }

    // 🔥 Filter EMPLOYEES by hub ONLY
    const employeeFilter = { deactivated: false };
    if (hub && hub !== "Hub" && hub !== "") {
      employeeFilter.hub = hub;
    }

    const employees = await Employee.find(employeeFilter, {
      userId: 1,
      userName: 1,
      hub: 1,
    }).lean();

    if (!employees.length) return NextResponse.json([]);

    const userIds = employees.map((e) => e.userId);

    // 🔥 SalesTarget Filter
    const targetQuery = { userId: { $in: userIds } };

    if (formattedMonth) {
      targetQuery.month = formattedMonth;
    }

    const targets = await SalesTarget.find(targetQuery, {
      userId: 1,
      customersAssigned: 1,
      userName: 1,
    }).lean();

    if (!targets.length) return NextResponse.json([]);

    // Employee → Accounts map
    const empMap = new Map();
    for (const emp of employees) {
      empMap.set(emp.userId, {
        userName: emp.userName,
        hub: emp.hub,
        accountCodes: new Set(),
      });
    }

    for (const t of targets) {
      const entry = empMap.get(t.userId);
      if (!entry) continue;

      entry.userName = t.userName || entry.userName;

      for (const c of t.customersAssigned || []) {
        if (c.accountCode) entry.accountCodes.add(c.accountCode);
      }
    }

    const employeesWithCustomers = [...empMap.entries()]
      .map(([userId, data]) => ({
        userId,
        ...data,
        accountCodes: [...data.accountCodes],
      }))
      .filter((e) => e.accountCodes.length > 0);

    if (!employeesWithCustomers.length) return NextResponse.json([]);

    const allCodes = [
      ...new Set(employeesWithCustomers.flatMap((e) => e.accountCodes)),
    ];

    // Sales aggregation
    const salesAgg = await Shipment.aggregate([
      {
        $match: {
          accountCode: { $in: allCodes },
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: "$accountCode",
          totalAmt: { $sum: "$totalAmt" },
        },
      },
    ]);

    const accountCodeToAmt = new Map();
    salesAgg.forEach((row) => accountCodeToAmt.set(row._id, row.totalAmt));

    // Outstanding aggregation
    const outstandingAgg = await Shipment.aggregate([
      {
        $match: {
          accountCode: { $in: allCodes },
          isHold: true,
          holdReason: "Credit Limit Exceeded",
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: "$accountCode",
          totalOutstanding: { $sum: "$totalAmt" },
        },
      },
    ]);

    const accountCodeToOutstanding = new Map();
    outstandingAgg.forEach((row) =>
      accountCodeToOutstanding.set(row._id, row.totalOutstanding)
    );

    // Final output
    const result = employeesWithCustomers.map((e) => {
      let saleAmt = 0;
      let outstanding = 0;

      for (const code of e.accountCodes) {
        saleAmt += accountCodeToAmt.get(code) || 0;
        outstanding += accountCodeToOutstanding.get(code) || 0;
      }

      return {
        salePerson: e.userName,
        hub: e.hub,
        saleAmt,
        outstanding,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Sales-person outstanding error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
