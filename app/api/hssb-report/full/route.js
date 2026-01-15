import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
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

  if (
    EU_COUNTRIES.some(
      (eu) => rc === eu.toUpperCase() || sector.includes(eu.toUpperCase())
    )
  )
    return "EUROPE";

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
    const user = searchParams.get("user");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const months = monthRange(from, to);

    // ------------------------------
    // 1. GET CUSTOMERS FROM SalesTarget (latest month)
    // ------------------------------
    let assignedCustomers = [];
    let stateAssigned = "State";

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
        userId: user,
        month: targetMonth,
      }).lean();
      if (st) {
        assignedCustomers = st.customersAssigned || [];
        stateAssigned = st.stateAssigned || "State";
        break;
      }
    }

    if (assignedCustomers.length === 0) {
      return NextResponse.json(
        { error: "No customers assigned." },
        { status: 404 }
      );
    }

    const accountCodes = assignedCustomers.map((c) => c.accountCode);

    // ✔ Fetch full customer details from CustomerAccount
    const accountDetails = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    }).lean();

    const accountMap = {};
    accountDetails.forEach((acc) => (accountMap[acc.accountCode] = acc));

    // ------------------------------
    // 2. FETCH SHIPMENTS
    // ------------------------------
    const shipments = await Shipment.find({
      accountCode: { $in: accountCodes },
    }).lean();

    // ------------------------------
    // 3. BUILD CUSTOMER ROW STRUCTURE
    // ------------------------------
    const rows = {};

    for (const cust of assignedCustomers) {
      const acc = accountMap[cust.accountCode] || {};

      rows[cust.accountCode] = {
        code: cust.accountCode,
        name: acc.name || cust.name,
        type: acc.accountType || cust.type || "Agent",
        city: acc.city || cust.city || "",
        state: acc.state || cust.state || stateAssigned,
        groupCode: acc.groupCode || "",

        // ✔ FIX 1: serviceTaxOption → use gst
        serviceTax: acc.gst || "",

        accountStatus: acc.account || "Activate",

        // ✔ FIX 2: salesperson → use salesPersonName
        salesman: acc.salesPersonName || user,

        months: {},
        regions: {},
      };
    }

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

    Object.keys(rows).forEach((cc) => {
      months.forEach((m) => {
        rows[cc].months[m] = 0;
      });
      REGION_LIST.forEach((r) => {
        rows[cc].regions[r] = {};
        months.forEach((m) => (rows[cc].regions[r][m] = 0));
      });
    });

    // ------------------------------
    // 4. PROCESS SHIPMENTS
    // ------------------------------
    for (const sh of shipments) {
      const month = sh.date.toISOString().slice(0, 7);

      if (!months.includes(month)) continue;

      const acc = sh.accountCode;
      if (!rows[acc]) continue;

      const sale = sh.chargeableWt || 0;

      rows[acc].months[month] += sale;

      const region = detectRegion(sh);
      const targetRegion = REGION_LIST.includes(region)
        ? region
        : "GRAND TOTAL";

      rows[acc].regions[targetRegion][month] += sale;
    }

    // ------------------------------
    // 5. RETURN FINAL RESPONSE
    // ------------------------------
    return NextResponse.json({
      state: stateAssigned,
      months,
      customers: Object.values(rows),
    });
  } catch (err) {
    console.log("HSSB FULL ERROR:", err);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
