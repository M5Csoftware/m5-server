//assign-customer/sales-target
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import SalesTarget from "@/app/model/SalesTarget";
import Employee from "@/app/model/Employee";

connectDB();

// 🔑 CORS helper
function corsResponse(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// ✅ Preflight request handler
export async function OPTIONS() {
  return corsResponse({}, 200);
}

// Helper to normalize month to YYYY-MM
function parseMonthYearToYYYYMM(monthYear) {
  if (!monthYear) return "";
  const [monthName, year] = monthYear.split(/[-\s]/); // split by space or hyphen
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth(); // 0-based
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`; // "2025-09"
}

// ✅ Create or update sales target + assignments
export async function POST(req) {
  try {
    const body = await req.json();
    let { userId, userName, month, targetTonnage, targetAmount, remarks, stateAssigned, citiesAssigned, customersAssigned } = body;

    if (!userId || !month) {
      return NextResponse.json({ error: "userId and month are required" }, { status: 400 });
    }

    // 🔹 Keep month as-is (e.g., "September-2025")
    // 🔹 Check if a record already exists
    let record = await SalesTarget.findOne({ userId, month });

    if (record) {
      // Update existing record
      record.targetTonnage = targetTonnage;
      record.targetAmount = targetAmount;
      record.remarks = remarks;
      record.stateAssigned = stateAssigned;
      record.citiesAssigned = citiesAssigned;
      record.customersAssigned = customersAssigned;
      record.userName = userName;
      await record.save();
    } else {
      // Create new record
      record = await SalesTarget.create({
        userId,
        userName,
        month,
        targetTonnage,
        targetAmount,
        remarks,
        stateAssigned,
        citiesAssigned,
        customersAssigned,
      });
    }

    // 🔹 Sync Employee only if current month
    const now = new Date();
    const currentMonthStr = `${now.toLocaleString("default", { month: "long" })}-${now.getFullYear()}`;
    if (month === currentMonthStr) {
      await Employee.findOneAndUpdate(
        { userId },
        {
          ...(stateAssigned && { stateAssigned }),
          ...(citiesAssigned && { cityAssigned: citiesAssigned }),
          ...(customersAssigned && { customersAssigned }),
        },
        { new: true }
      );
    }

    return NextResponse.json(record, { status: 200 });
  } catch (err) {
    console.error("Error saving sales target:", err);
    return NextResponse.json(
      { error: "Failed to save target/assignment", details: err.message },
      { status: 500 }
    );
  }
}


// ✅ Get targets + assignments
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId")?.trim();
    const month = searchParams.get("month")?.trim(); // expected "September-2025"

    if (!userId || !month) {
      return NextResponse.json({ error: "userId and month are required" }, { status: 400 });
    }

    // 🔹 Fetch from SalesTarget using exact month string
    const record = await SalesTarget.findOne({ userId, month });

    if (!record) {
      // Return default structure if no record exists
      return NextResponse.json({
        userId,
        month,
        targetTonnage: 0,
        targetAmount: 0,
        remarks: "",
        stateAssigned: "",
        citiesAssigned: [],
        customersAssigned: [],
      }, { status: 200 });
    }

    // Flatten fields for frontend
    const flattened = {
      userId: record.userId,
      userName: record.userName,
      month: record.month,
      targetTonnage: record.targetTonnage || 0,
      targetAmount: record.targetAmount || 0,
      remarks: record.remarks || "",
      stateAssigned: record.stateAssigned || "",
      citiesAssigned: record.citiesAssigned || [],
      customersAssigned: record.customersAssigned || [],
    };

    return NextResponse.json(flattened, { status: 200 });
  } catch (err) {
    console.error("Error fetching sales target:", err);
    return NextResponse.json(
      { error: "Failed to fetch target", details: err.message },
      { status: 500 }
    );
  }
}

// ✅ Update existing sales target only (not assignments)
export async function PUT(req) {
  try {
    const body = await req.json();
    const { id, targetTonnage, targetAmount, remarks } = body;

    const updated = await SalesTarget.findByIdAndUpdate(
      id,
      { targetTonnage, targetAmount, remarks },
      { new: true }
    );

    if (!updated) {
      return corsResponse({ error: "Target not found" }, 404);
    }

    return corsResponse(updated, 200);
  } catch (err) {
    console.error("PUT sales-target error:", err);
    return corsResponse(
      { error: "Failed to update sales target", details: err.message },
      500
    );
  }
}
