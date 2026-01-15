import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
    }

    // ---------- Fetch shipments ----------
    const shipments = await Shipment.find({
      date: { $gte: new Date(from), $lte: new Date(to + "T23:59:59") },
    }).lean();

    const accountCodes = shipments.map((s) => s.accountCode).filter(Boolean);
    const accounts = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    }).lean();
    const accountMap = {};
    accounts.forEach((a) => (accountMap[a.accountCode] = a));

    // ---------- Previous month ----------
    const toDate = new Date(to);
    const prevEnd = new Date(toDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setMonth(prevStart.getMonth() - 1);
    prevStart.setDate(prevStart.getDate() + 1);

    const prevShipments = await Shipment.find({
      date: { $gte: prevStart, $lte: prevEnd },
    }).lean();

    const prevAccountCodes = prevShipments
      .map((s) => s.accountCode)
      .filter(Boolean);
    const prevAccounts = await CustomerAccount.find({
      accountCode: { $in: prevAccountCodes },
    }).lean();
    const prevAccountMap = {};
    prevAccounts.forEach((a) => (prevAccountMap[a.accountCode] = a));

    // ---------- Build SEC & HUB rows ----------
    const secHubMap = {};
    shipments.forEach((s) => {
      const account = accountMap[s.accountCode] || {};
      const sec = (s.sector || "Unknown").trim();
      const hub = (account.hub || "Unknown").trim();

      if (!secHubMap[sec])
        secHubMap[sec] = {
          awb: 0,
          weight: 0,
          revenue: 0,
          igst: 0,
          total: 0,
          hubs: {},
        };
      const secRow = secHubMap[sec];
      secRow.awb += 1;
      secRow.weight += s.totalVolWt || 0;
      secRow.revenue += s.basicAmt || 0;
      secRow.igst += (s.sgst || 0) + (s.cgst || 0);
      secRow.total += s.totalAmt || 0;

      if (!secRow.hubs[hub])
        secRow.hubs[hub] = { awb: 0, weight: 0, revenue: 0, igst: 0, total: 0 };
      const hubRow = secRow.hubs[hub];
      hubRow.awb += 1;
      hubRow.weight += s.totalVolWt || 0;
      hubRow.revenue += s.basicAmt || 0;
      hubRow.igst += (s.sgst || 0) + (s.cgst || 0);
      hubRow.total += s.totalAmt || 0;
    });

    // Previous month aggregation
    const prevSecHubMap = {};
    prevShipments.forEach((s) => {
      const account = prevAccountMap[s.accountCode] || {};
      const sec = (s.sector || "Unknown").trim();
      const hub = (account.hub || "Unknown").trim();
      if (!prevSecHubMap[sec]) prevSecHubMap[sec] = { total: 0, hubs: {} };
      prevSecHubMap[sec].total += s.totalAmt || 0;
      if (!prevSecHubMap[sec].hubs[hub])
        prevSecHubMap[sec].hubs[hub] = { total: 0 };
      prevSecHubMap[sec].hubs[hub].total += s.totalAmt || 0;
    });

    // ---------- Prepare Excel rows ----------
    const rows = [];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const prevMonthLabel = `Prev (${
      monthNames[prevStart.getMonth()]
    } ${prevStart.getFullYear()})`;

    Object.keys(secHubMap).forEach((sec) => {
      const secRow = secHubMap[sec];
      const prevSecTotal = prevSecHubMap[sec]?.total || 0;
      rows.push({
        SEC_HUB: sec,
        AWB: secRow.awb,
        WT: secRow.weight,
        REVENUE: secRow.revenue,
        IGST: secRow.igst,
        TOTAL: secRow.total,
        [prevMonthLabel]: prevSecTotal,
        DIFF: secRow.total - prevSecTotal,
        isSector: true,
      });

      Object.keys(secRow.hubs).forEach((hub) => {
        const hubRow = secRow.hubs[hub];
        const prevHubTotal = prevSecHubMap[sec]?.hubs[hub]?.total || 0;
        rows.push({
          SEC_HUB: hub,
          AWB: hubRow.awb,
          WT: hubRow.weight,
          REVENUE: hubRow.revenue,
          IGST: hubRow.igst,
          TOTAL: hubRow.total,
          [prevMonthLabel]: prevHubTotal,
          DIFF: hubRow.total - prevHubTotal,
          isSector: false,
        });
      });
    });

    // ---------- Compute SEC total row ----------
    const totalSecRow = {
      SEC_HUB: "TOTAL SEC",
      AWB: 0,
      WT: 0,
      REVENUE: 0,
      IGST: 0,
      TOTAL: 0,
      [prevMonthLabel]: 0,
      DIFF: 0,
      isSector: true,
    };

    rows.forEach((r) => {
      if (r.isSector) {
        totalSecRow.AWB += r.AWB || 0;
        totalSecRow.WT += r.WT || 0;
        totalSecRow.REVENUE += r.REVENUE || 0;
        totalSecRow.IGST += r.IGST || 0;
        totalSecRow.TOTAL += r.TOTAL || 0;
        totalSecRow[prevMonthLabel] += r[prevMonthLabel] || 0;
        totalSecRow.DIFF += r.DIFF || 0;
      }
    });

    rows.push(totalSecRow);

    // ---------- Excel ----------
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sec & Hub");

    // Columns
    sheet.columns = Object.keys(rows[0])
      .filter((k) => k !== "isSector")
      .map((k) => ({ header: k.toUpperCase(), key: k, width: 20 }));

    // Add rows
    rows.forEach((r) => {
      const { isSector, ...clean } = r;
      sheet.addRow(clean);
    });

    // Style header
    sheet.getRow(1).eachCell((c) => {
      c.font = { bold: true };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD4F4DD" },
      };
    });

    // Style sector rows
    rows.forEach((r, idx) => {
      if (r.isSector) {
        sheet.getRow(idx + 2).eachCell((c) => (c.font = { bold: true }));
      }
    });

    // Style total SEC row (red background)
    const totalRowIdx = rows.length + 1; // last row
    sheet.getRow(totalRowIdx).eachCell((c) => {
      c.font = { bold: true };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF9999" },
      };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Disposition": `attachment; filename=Sec_Hub_Report.xlsx`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to export excel" },
      { status: 500 }
    );
  }
}
