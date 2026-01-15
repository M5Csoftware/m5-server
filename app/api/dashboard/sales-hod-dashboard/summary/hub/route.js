import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import SalesTarget from "@/app/model/SalesTarget";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

// Convert month string → date range
function getMonthRange(monthStr) {
  if (!monthStr) return null;

  let start, end;

  // Case 1: YYYY-MM
  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    start = new Date(`${monthStr}-01`);
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  // Case 2: Month-YYYY
  const parts = monthStr.split("-");
  if (parts.length === 2) {
    const [m, y] = parts;
    const monthIndex = new Date(`${m} 1, ${y}`).getMonth();

    if (!isNaN(monthIndex)) {
      start = new Date(y, monthIndex, 1);
      end = new Date(y, monthIndex + 1, 1);
      return { start, end };
    }
  }

  return null;
}

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const range = getMonthRange(month);

    // 1️⃣ Fetch employees with a hub
    const employees = await Employee.find(
      { hub: { $nin: ["", null] } },
      { userId: 1, hub: 1 }
    ).lean();

    if (!employees.length) return NextResponse.json([]);

    const hubs = [...new Set(employees.map((e) => e.hub))];

    // 2️⃣ Map employees → hubs
    const userToHub = new Map();
    for (const emp of employees) {
      userToHub.set(emp.userId, emp.hub);
    }

    // 3️⃣ Get targets for these employees
    const targets = await SalesTarget.find(
      { userId: { $in: employees.map((e) => e.userId) } },
      { userId: 1, customersAssigned: 1 }
    ).lean();

    // 4️⃣ hub → accountCodes
    const hubToAccountCodes = new Map();
    hubs.forEach((h) => hubToAccountCodes.set(h, new Set()));

    for (const t of targets) {
      const hub = userToHub.get(t.userId);
      if (!hub) continue;

      if (Array.isArray(t.customersAssigned)) {
        for (const cust of t.customersAssigned) {
          if (cust?.accountCode) {
            hubToAccountCodes.get(hub).add(cust.accountCode);
          }
        }
      }
    }

    // 5️⃣ Calculate shipment totals per hub
    const result = [];

    for (const hub of hubs) {
      const accountCodes = [...hubToAccountCodes.get(hub)];

      if (accountCodes.length === 0) {
        result.push({ hub, awb: 0, chgWt: 0, total: 0 });
        continue;
      }

      // Build match query
      const match = { accountCode: { $in: accountCodes } };

      // Apply month filter (if provided)
      if (range) {
        match.date = { $gte: range.start, $lt: range.end };
      }

      const agg = await Shipment.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            awb: { $sum: 1 },
            chgWt: { $sum: "$chargeableWt" },
            total: { $sum: "$totalAmt" },
          },
        },
      ]);

      if (!agg.length) {
        result.push({ hub, awb: 0, chgWt: 0, total: 0 });
      } else {
        result.push({
          hub,
          awb: agg[0].awb,
          chgWt: agg[0].chgWt,
          total: agg[0].total,
        });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Hub summary error:", err);
    return NextResponse.json(
      { error: "Failed to load hub summary" },
      { status: 500 }
    );
  }
}
