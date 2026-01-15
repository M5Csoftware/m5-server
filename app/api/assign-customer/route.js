//assign-customer
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Employee from "@/app/model/Employee";
import SalesTarget from "@/app/model/SalesTarget";

// Ensure DB connection
connectDB();

// Helper to normalize month to YYYY-MM
function parseMonthYearToYYYYMM(monthYear) {
  if (!monthYear) return "";
  const [monthName, year] = monthYear.split(/[-\s]/); // split by space or hyphen
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth(); // 0-based
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`; // "2025-09"
}

// In your API route (assign-customer GET handler)

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId")?.trim();
    const accountCode = searchParams.get("accountCode")?.trim();
    const q = searchParams.get("q")?.trim();
    const state = searchParams.get("state")?.trim();
    const city = searchParams.get("city")?.trim();
    const fetchStates = searchParams.get("fetchStates");
    const month = searchParams.get("month")?.trim();

    // --- Fetch all states and cities ---
    if (fetchStates === "true") {
      const states = await CustomerAccount.distinct("state");
      const stateCityMap = {};
      for (const st of states) {
        const cities = await CustomerAccount.distinct("city", { state: st });
        stateCityMap[st] = cities;
      }
      return NextResponse.json(stateCityMap, { status: 200 });
    }

    // --- Search by accountCode ---
    if (accountCode) {
      const customer = await CustomerAccount.findOne({ accountCode });
      return NextResponse.json(customer || { error: "Customer not found" }, {
        status: 200,
      });
    }

    // --- Search salespersons ---
    if (q !== null && q !== undefined) {
      const employees = await Employee.find(
        q
          ? {
              department: "Sales",
              $or: [
                { userName: { $regex: q, $options: "i" } },
                { userId: { $regex: q, $options: "i" } },
              ],
            }
          : { department: "Sales" }
      );

      // ✅ FIX: When month is provided, fetch customer count from SalesTarget
      const results = await Promise.all(
        employees.map(async (emp) => {
          let customerCount = 0;

          if (month) {
            // Fetch from SalesTarget for specific month
            const salesTarget = await SalesTarget.findOne({
              userId: emp.userId,
              month,
            });
            customerCount = salesTarget?.customersAssigned?.length || 0;
          } else {
            // Fallback: count from CustomerAccount if no month specified
            customerCount = await CustomerAccount.countDocuments({
              salesPersonName: emp.userName,
            });
          }

          return {
            userId: emp.userId,
            userName: emp.userName,
            department: emp.department,
            customerCount,
          };
        })
      );

      return NextResponse.json(results, { status: 200 });
    }

    // --- Customers by state & city ---
    if (state && city) {
      const customers = await CustomerAccount.find({ state, city }).select(
        "accountCode name"
      );
      return NextResponse.json(customers, { status: 200 });
    }

    // --- Fetch assigned data by userId ---
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const employee = await Employee.findOne({ userId, department: "Sales" });
    if (!employee) {
      return NextResponse.json(
        { error: "Sales employee not found" },
        { status: 404 }
      );
    }

    let salesTarget = null;
    let stateAssigned = "";
    let citiesAssigned = [];
    let customersAssigned = [];

    if (month) {
      // Fetch SalesTarget for selected month
      salesTarget = await SalesTarget.findOne({ userId, month });

      if (salesTarget) {
        stateAssigned = salesTarget.stateAssigned || "";
        citiesAssigned = salesTarget.citiesAssigned || [];
        customersAssigned = salesTarget.customersAssigned || [];
      } else {
        stateAssigned = "";
        citiesAssigned = [];
        customersAssigned = [];
      }
    } else {
      // Fallback when no month specified
      stateAssigned = employee.stateAssigned || "";
      citiesAssigned = employee.cityAssigned || [];
      customersAssigned = await CustomerAccount.find({
        salesPersonName: employee.userName,
      }).select("accountCode name");
    }

    return NextResponse.json(
      {
        userId: employee.userId,
        userName: employee.userName,
        department: employee.department,
        stateAssigned,
        citiesAssigned,
        customersAssigned,
        salesTarget,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Failed to fetch data:", err);
    return NextResponse.json(
      { error: "Failed to fetch data", details: err.message },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    const body = await req.json();
    let {
      userId,
      userName,
      stateAssigned,
      cities,
      addCustomers,
      removeCustomers,
      month,
      targetTonnage,
      targetAmount,
      remarks,
    } = body;

    if (!userId || !month) {
      return NextResponse.json(
        { error: "Missing required fields: userId or month" },
        { status: 400 }
      );
    }

    // Normalize arrays
    cities = Array.isArray(cities)
      ? cities
      : cities
      ? cities
          .toString()
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : [];
    addCustomers = Array.isArray(addCustomers) ? addCustomers : [];
    removeCustomers = Array.isArray(removeCustomers) ? removeCustomers : [];

    // Fetch employee
    const employee = await Employee.findOne({ userId, department: "Sales" });
    if (!employee) {
      return NextResponse.json(
        { error: "Sales employee not found" },
        { status: 404 }
      );
    }
    userName = userName || employee.userName;

    // 1️⃣ Update Employee
    const updatedEmployee = await Employee.findOneAndUpdate(
      { userId },
      { stateAssigned, cityAssigned: cities },
      { new: true }
    );

    // 2️⃣ Upsert SalesTarget
    let salesTarget = await SalesTarget.findOneAndUpdate(
      { userId, month },
      {
        $setOnInsert: { userId, userName, month },
        $set: {
          stateAssigned,
          citiesAssigned: cities,
          targetTonnage: targetTonnage ?? 0,
          targetAmount: targetAmount ?? 0,
          remarks: remarks || "",
        },
      },
      { upsert: true, new: true }
    );

    // Ensure customersAssigned is an array
    salesTarget.customersAssigned = Array.isArray(salesTarget.customersAssigned)
      ? salesTarget.customersAssigned
      : [];

    // Helper to fix Boolean fields
    function fixBooleanFields(cust) {
      const booleanFields = [
        "enableOS",
        "allServiceSettings",
        "enableVolDiscount",
        "enablePortalPassword",
        "upsLabel",
        "yadelLabel",
        "post11Label",
        "dhlLabel",
        "upsStandardLabel",
        "enableLabelSetting",
      ];
      for (const field of booleanFields) {
        if (cust[field] === "" || cust[field] == null) {
          cust[field] = false;
        } else {
          cust[field] = Boolean(cust[field]);
        }
      }
    }

    // 3️⃣ Remove customers
    for (const code of removeCustomers) {
      const cust = await CustomerAccount.findOne({ accountCode: code });
      if (cust && cust.salesPersonName === userName) {
        cust.salesPersonName = "";
        fixBooleanFields(cust);
        await cust.save();
      }
      salesTarget.customersAssigned = salesTarget.customersAssigned.filter(
        (c) => c.accountCode !== code
      );
    }

    // 4️⃣ Add new customers
    for (const code of addCustomers) {
      const cust = await CustomerAccount.findOne({ accountCode: code });
      if (!cust) continue;

      // Remove from previous salesperson if assigned
      if (cust.salesPersonName && cust.salesPersonName !== userName) {
        const prevTarget = await SalesTarget.findOne({
          userName: cust.salesPersonName,
          month,
        });
        if (prevTarget && Array.isArray(prevTarget.customersAssigned)) {
          prevTarget.customersAssigned =
            prevTarget.customersAssigned.filter(
              (c) => c.accountCode !== code
            );
          await prevTarget.save();
        }
      }

      // Assign to new salesperson
      cust.salesPersonName = userName;
      fixBooleanFields(cust);
      await cust.save();

      if (!salesTarget.customersAssigned.some((c) => c.accountCode === code)) {
        salesTarget.customersAssigned.push({
          accountCode: code,
          name: cust.name || "",
        });
      }
    }

    await salesTarget.save();

    return NextResponse.json({
      message: "Employee and SalesTarget updated successfully",
      employee: updatedEmployee,
      salesTarget,
    });
  } catch (err) {
    console.error("PUT error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    );
  }
}



export async function POST(req) {
  try {
    const records = await req.json(); // Excel data array

    if (!Array.isArray(records) || !records.length) {
      return NextResponse.json(
        { error: "No records provided" },
        { status: 400 }
      );
    }

    const results = [];

    for (const row of records) {
      try {
        let {
          userId,
          userName,
          stateAssigned,
          cities,
          addCustomers,
          removeCustomers,
          month,
          targetTonnage,
          targetAmount,
          remarks,
        } = row;

        // Normalize missing arrays
        cities = Array.isArray(cities)
          ? cities
          : cities
          ? cities
              .toString()
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
          : [];
        addCustomers = Array.isArray(addCustomers) ? addCustomers : [];
        removeCustomers = Array.isArray(removeCustomers) ? removeCustomers : [];

        if (!userId || !month) {
          results.push({
            row,
            status: "skipped",
            reason: "Missing userId or month",
          });
          continue;
        }

        const employee = await Employee.findOne({
          userId,
          department: "Sales",
        });
        if (!employee) {
          results.push({
            row,
            status: "skipped",
            reason: "Sales employee not found",
          });
          continue;
        }

        userName = userName || employee.userName;

        // 1️⃣ Update Employee
        await Employee.findOneAndUpdate(
          { userId },
          { stateAssigned, cityAssigned: cities },
          { new: true }
        );

        // 2️⃣ Upsert SalesTarget
        let salesTarget = await SalesTarget.findOneAndUpdate(
          { userId, month },
          {
            $setOnInsert: { userId, userName, month, customersAssigned: [] },
            $set: {
              stateAssigned,
              citiesAssigned: cities,
              targetTonnage: targetTonnage || 0,
              targetAmount: targetAmount || 0,
              remarks: remarks || "",
            },
          },
          { upsert: true, new: true }
        );

        // Ensure customersAssigned exists
        salesTarget.customersAssigned = Array.isArray(
          salesTarget.customersAssigned
        )
          ? salesTarget.customersAssigned
          : [];

        // 3️⃣ Remove customers
        for (const code of removeCustomers) {
          salesTarget.customersAssigned = salesTarget.customersAssigned.filter(
            (c) => c.accountCode !== code
          );
          const cust = await CustomerAccount.findOne({ accountCode: code });
          if (cust && cust.salesPersonName === userName) {
            cust.salesPersonName = "";
            await cust.save();
          }
        }

        // 4️⃣ Add customers
        for (const accountCode of addCustomers) {
          const cust = await CustomerAccount.findOne({ accountCode });
          if (!cust) continue;

          cust.salesPersonName = cust.salesPersonName || "";

          // Remove from previous salesperson if needed
          if (cust.salesPersonName && cust.salesPersonName !== userName) {
            const prevTarget = await SalesTarget.findOne({
              userName: cust.salesPersonName,
              month,
            });
            if (prevTarget && Array.isArray(prevTarget.customersAssigned)) {
              prevTarget.customersAssigned =
                prevTarget.customersAssigned.filter(
                  (c) => c.accountCode !== accountCode
                );
              await prevTarget.save();
            }
          }

          cust.salesPersonName = userName;
          await cust.save();

          // Add to salesTarget if not already present
          if (
            !salesTarget.customersAssigned.some(
              (c) => c.accountCode === accountCode
            )
          ) {
            salesTarget.customersAssigned.push({
              accountCode,
              name: cust.name || "",
            });
          }
        }

        await salesTarget.save();

        results.push({ row, status: "success" });
      } catch (err) {
        console.error("Error processing row:", row, err);
        results.push({ row, status: "failed", reason: err.message });
      }
    }

    return NextResponse.json({
      message: "Bulk upload processed",
      results,
    });
  } catch (err) {
    console.error("Bulk upload error:", err);
    return NextResponse.json(
      { error: "Bulk upload failed", details: err.message },
      { status: 500 }
    );
  }
}
