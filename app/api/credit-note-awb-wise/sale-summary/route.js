import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import AccountLedger from "@/app/model/AccountLedger";

const parseDate = (value) => {
  if (!value) return null;

  // already ISO
  if (value.includes("-")) {
    const d = new Date(value);
    return isNaN(d) ? null : d;
  }

  // DD/MM/YYYY
  if (value.includes("/")) {
    const [dd, mm, yyyy] = value.split("/");
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    return isNaN(d) ? null : d;
  }

  return null;
};

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { success: false, message: "From & To dates required" },
        { status: 400 }
      );
    }

    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    if (!fromDate || !toDate) {
      return NextResponse.json(
        { success: false, message: "Invalid date format" },
        { status: 400 }
      );
    }

    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const branch = searchParams.get("branch");
    const state = searchParams.get("state");
    const salePerson = searchParams.get("salePerson");
    const accountManager = searchParams.get("accountManager");
    const customerCode = searchParams.get("customerCode");

    // 🔹 Fetch billed shipments
    const shipments = await Shipment.find({
      date: { $gte: fromDate, $lte: toDate },
      isBilled: true,
    }).lean();

    if (!shipments.length) {
      return NextResponse.json({ success: true, data: [], totals: {} });
    }

    // 🔹 Group shipment totals by customer
    const saleMap = {};
    shipments.forEach((s) => {
      if (!s.accountCode) return;

      if (!saleMap[s.accountCode]) {
        saleMap[s.accountCode] = {
          BasicAmount: 0,
          DiscountAmt: 0,
          RateHike: 0,
          SGST: 0,
          CGST: 0,
          IGST: 0,
          Handling: 0,
          OVWT: 0,
          Mischg: 0,
          Fuel: 0,
          NonTaxable: 0,
          GrandTotal: 0,
        };
      }

      saleMap[s.accountCode].BasicAmount += s.basicAmt || 0;
      saleMap[s.accountCode].DiscountAmt += s.discountAmt || 0;
      saleMap[s.accountCode].RateHike += s.hikeAmt || 0;
      saleMap[s.accountCode].SGST += s.sgst || 0;
      saleMap[s.accountCode].CGST += s.cgst || 0;
      saleMap[s.accountCode].IGST += s.igst || 0;
      saleMap[s.accountCode].Handling += s.handlingAmount || 0;
      saleMap[s.accountCode].OVWT += s.overWtHandling || 0;
      saleMap[s.accountCode].Mischg += s.miscChg || 0;
      saleMap[s.accountCode].Fuel += s.fuelAmt || 0;
      saleMap[s.accountCode].NonTaxable += s.duty || 0;
      saleMap[s.accountCode].GrandTotal += s.totalAmt || 0;
    });

    const accountCodes = Object.keys(saleMap);

    // 🔹 Fetch customers
    const customers = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    }).lean();

    const customerMap = {};
    customers.forEach((c) => (customerMap[c.accountCode] = c));

    // 🔹 Fetch ledger
    const ledgers = await AccountLedger.find({
      accountCode: { $in: accountCodes },
      date: { $lte: toDate },
    }).lean();

    const ledgerMap = {};
    ledgers.forEach((l) => {
      if (!ledgerMap[l.accountCode]) {
        ledgerMap[l.accountCode] = {
          TotalRcpt: 0,
          TotalDebit: 0,
          TotalCredit: 0,
        };
      }

      if (l.type === "RCPT")
        ledgerMap[l.accountCode].TotalRcpt += l.amount || 0;
      if (l.type === "Debit")
        ledgerMap[l.accountCode].TotalDebit += l.amount || 0;
      if (l.type === "Credit")
        ledgerMap[l.accountCode].TotalCredit += l.amount || 0;
    });

    // 🔹 Final rows
    const data = accountCodes.map((code) => {
      const c = customerMap[code] || {};
      const s = saleMap[code];
      const l = ledgerMap[code] || {};

      const opening = parseFloat(c.openingBalance || 0);
      const outstanding = opening + (l.TotalDebit || 0) - (l.TotalRcpt || 0);

      return {
        CustomerCode: code,
        CustomerName: c.name || "",
        Type: c.accountType || "",
        BranchCode: c.branch || "",
        State: c.state || "",
        City: c.city || "",
        SalePerson: c.salesPersonName || "",
        RefrenceBy: c.referenceBy || "",
        ManagedBy: c.managedBy || "",
        CollectionBy: c.collectionBy || "",
        AccountManager: c.accountManager || "",
        GM: c.gm || "",
        RM: c.rm || "",
        SM: c.sm || "",
        RateType: c.rateType || "",
        Currency: c.currency || "INR",

        ...s,
        BasicAmtAfterDiscount: s.BasicAmount - s.DiscountAmt,

        OpeningBalance: opening,
        TotalRcpt: l.TotalRcpt || 0,
        TotalDebit: l.TotalDebit || 0,
        TotalCredit: l.TotalCredit || 0,
        TotalOutStanding: outstanding,
      };
    });

    let filteredData = data;

    // customer-wise filters
    const norm = (v) =>
      String(v || "")
        .trim()
        .toLowerCase();

    if (branch) {
      filteredData = filteredData.filter(
        (d) => norm(d.BranchCode) === norm(branch)
      );
    }

    if (state) {
      filteredData = filteredData.filter((d) => norm(d.State) === norm(state));
    }

    if (salePerson) {
      filteredData = filteredData.filter(
        (d) => norm(d.SalePerson) === norm(salePerson)
      );
    }

    if (accountManager) {
      filteredData = filteredData.filter(
        (d) => norm(d.AccountManager) === norm(accountManager)
      );
    }

    if (customerCode) {
      filteredData = filteredData.filter(
        (d) => norm(d.CustomerCode) === norm(customerCode)
      );
    }

    return NextResponse.json({
      success: true,
      data: filteredData,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
