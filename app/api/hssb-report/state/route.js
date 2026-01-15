import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import SalesTarget from "@/app/model/SalesTarget";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

const EU_COUNTRIES = [
  "Austria",
  "Belgium",
  "Bulgaria",
  "Croatia",
  "Cyprus",
  "Czech Republic",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Ireland",
  "Italy",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Netherlands",
  "Poland",
  "Portugal",
  "Romania",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
];

function detectRegion(sh) {
  const svc = sh.service?.toUpperCase() || "";
  const sector = sh.sector?.toUpperCase() || "";
  const rc = (sh.receiverCountry || "").toUpperCase();

  if (svc.includes("IE")) return "FEDEX IE";
  if (svc.includes("BRAND")) return "BRANDED";

  if (sector.includes("USA") || ["USA", "US", "UNITED STATES"].includes(rc))
    return "USA";

  if (sector.includes("UK") || ["UK", "UNITED KINGDOM"].includes(rc))
    return "UK";

  if (sector.includes("CAN") || rc === "CANADA") return "CANADA";
  if (sector.includes("AUS") || rc === "AUSTRALIA") return "AUSTRALIA";

  if (EU_COUNTRIES.some((eu) => rc === eu.toUpperCase())) return "EUROPE";

  return "OTHER";
}

function monthRange(from, to) {
  let [fy, fm] = from.split("-").map(Number);
  let [ty, tm] = to.split("-").map(Number);
  const arr = [];

  while (fy < ty || (fy === ty && fm <= tm)) {
    arr.push(`${fy}-${String(fm).padStart(2, "0")}`);
    fm++;
    if (fm === 13) {
      fm = 1;
      fy++;
    }
  }
  return arr;
}

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const state = searchParams.get("state");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!state || !from || !to) {
      return NextResponse.json(
        { error: "Missing state/from/to" },
        { status: 400 }
      );
    }

    const months = monthRange(from, to);

    // ---------------------------------------------------------
    // 1) FIND SALES EMPLOYEES FOR THIS STATE
    // ---------------------------------------------------------
    const employeeFilter =
      state === "All States"
        ? { department: "Sales", deactivated: false }
        : { department: "Sales", stateAssigned: state, deactivated: false };

    const employees = await Employee.find(employeeFilter).lean();

    if (employees.length === 0) {
      return NextResponse.json(
        { error: "No employees for this state" },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // 2) FOR EACH EMPLOYEE → FIND LATEST SALESTARGET IN RANGE
    // ---------------------------------------------------------
    const employeeData = {};

    for (const emp of employees) {
      const userId = emp.userId;
      let assignedCustomers = [];
      let fallbackState = state === "All States" ? emp.stateAssigned : state;

      for (let i = months.length - 1; i >= 0; i--) {
        const [year, mm] = months[i].split("-");
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
        const targetMonth = `${monthNames[Number(mm) - 1]}-${year}`;

        const st = await SalesTarget.findOne({
          userId,
          month: targetMonth,
        }).lean();

        if (st) {
          assignedCustomers = st.customersAssigned || [];
          fallbackState = st.stateAssigned || state;
          break;
        }
      }

      employeeData[userId] = {
        employee: emp,
        customers: assignedCustomers,
        stateAssigned: fallbackState,
      };
    }

    // ---------------------------------------------------------
    // 3) COLLECT ALL CUSTOMERS FOR MASTER SHEET
    // ---------------------------------------------------------
    let allCodes = [];

    Object.values(employeeData).forEach((emp) => {
      allCodes.push(...emp.customers.map((c) => c.accountCode));
    });

    allCodes = [...new Set(allCodes)];

    // ---------------------------------------------------------
    // 4) LOAD CUSTOMER ACCOUNT DETAILS
    // ---------------------------------------------------------
    const accDetails = await CustomerAccount.find({
      accountCode: { $in: allCodes },
    }).lean();

    const accMap = {};
    accDetails.forEach((a) => (accMap[a.accountCode] = a));

    // ---------------------------------------------------------
    // 5) LOAD SHIPMENTS (ALL CUSTOMERS)
    // ---------------------------------------------------------
    const shipments = await Shipment.find({
      accountCode: { $in: allCodes },
      date: {
        $gte: new Date(from + "-01T00:00:00Z"),
        $lte: new Date(to + "-31T23:59:59Z"),
      },
    }).lean();

    // ---------------------------------------------------------
    // REGION LIST
    // ---------------------------------------------------------
    const REGION_LIST = [
      "GRAND TOTAL",
      "AUSTRALIA",
      "BRANDED",
      "CANADA",
      "EUROPE",
      "FEDEX IE",
      "UK",
      "USA",
    ];

    // ---------------------------------------------------------
    // 6) BUILD MASTER ROWS
    // ---------------------------------------------------------
    const master = {};

    for (const code of allCodes) {
      const acc = accMap[code] || {};

      master[code] = {
        code,
        name: acc.name || "",
        type: acc.accountType || "",
        city: acc.city || "",
        state: acc.state || "",
        groupCode: acc.groupCode || "",
        serviceTax: acc.gst || "",
        accountStatus: acc.account || "Activate",
        salesman: acc.salesPersonName || "",

        months: {},
        regions: {},
      };

      months.forEach((m) => {
        master[code].months[m] = 0;
      });

      REGION_LIST.forEach((r) => {
        master[code].regions[r] = {};
        months.forEach((m) => (master[code].regions[r][m] = 0));
      });
    }

    // ---------------------------------------------------------
    // 7) APPLY SHIPMENTS TO MASTER
    // ---------------------------------------------------------
    for (const sh of shipments) {
      const m = sh.date.toISOString().slice(0, 7);
      if (!months.includes(m)) continue;

      const code = sh.accountCode;
      if (!master[code]) continue;

      const sale = sh.chargeableWt || 0;

      master[code].months[m] += sale;

      const region = detectRegion(sh);
      const r = REGION_LIST.includes(region) ? region : "GRAND TOTAL";

      master[code].regions[r][m] += sale;
    }

    // ---------------------------------------------------------
    // 8) SPLIT MASTER INTO PER-EMPLOYEE DATASETS
    // ---------------------------------------------------------
    const perEmployee = {};

    for (const emp of employees) {
      const uid = emp.userId;
      perEmployee[uid] = [];

      const custList = employeeData[uid].customers;

      for (const c of custList) {
        const code = c.accountCode;
        if (master[code]) perEmployee[uid].push(master[code]);
      }
    }

    // ---------------------------------------------------------
    // 9) STATE TOTALS (Merged)
    // ---------------------------------------------------------
    const stateTotals = {};

    months.forEach((m) => {
      let total = 0;

      shipments.forEach((sh) => {
        const mm = sh.date.toISOString().slice(0, 7);
        if (mm === m) total += sh.chargeableWt || 0;
      });

      stateTotals[m] = total;
    });

    // ---------------------------------------------------------
    // FINAL RESPONSE
    // ---------------------------------------------------------
    return NextResponse.json({
      state,
      months,
      employees,

      // MASTER DATA
      masterCustomers: Object.values(master),

      // PER EMPLOYEE
      employeeCustomers: perEmployee,

      // STATE SUMMARY TOTALS
      stateTotals,
    });
  } catch (err) {
    console.log("STATE HSSB ERROR:", err);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
