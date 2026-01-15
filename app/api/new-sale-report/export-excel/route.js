import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

await connectDB();

// ✅ DATE PARSER - DD/MM/YYYY → proper Date object
function parseDateFlexible(dateStr) {
  if (!dateStr) return null;

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + "T00:00:00");
  }

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split("/");
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }

  return null;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "AWB Wise" | "Client Wise" | "Comparison"
    const mode = searchParams.get("mode"); // for Comparison: State, Product, Hub, Sec & Hub
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const prevFrom = searchParams.get("prevFrom");
    const prevTo = searchParams.get("prevTo");

    if (!from || !to) {
      return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
    }

    // ✅ FIX: Parse dates properly
    const startDate = parseDateFlexible(from);
    const endDate = parseDateFlexible(to);

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "Invalid date format. Use DD/MM/YYYY or YYYY-MM-DD" },
        { status: 400 }
      );
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Helper function to get previous month range
    const getPreviousMonthRange = (toDateStr) => {
      const toDate = parseDateFlexible(toDateStr) || new Date(toDateStr);
      const prevEnd = new Date(toDate);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setMonth(prevStart.getMonth() - 1);
      prevStart.setDate(prevStart.getDate() + 1);

      const formatDate = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")}`;

      return {
        from: formatDate(prevStart),
        to: formatDate(prevEnd),
      };
    };

    const query = {
      date: { $gte: startDate, $lte: endDate },
    };
    const shipments = await Shipment.find(query).lean();

    // Build account map
    const accountCodes = shipments.map((s) => s.accountCode).filter(Boolean);
    const accounts = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    }).lean();
    const accountMap = {};
    accounts.forEach((acc) => (accountMap[acc.accountCode] = acc));

    let rows = [];

    // ================== AWB WISE ==================
    if (type === "AWB Wise") {
      rows = shipments.map((item) => {
        const account = accountMap[item.accountCode] || {};
        return {
          AwbNo: item.awbNo || "",
          BookingDate: item.date?.toISOString().split("T")[0] || "",
          FlightDate: item.flightDate || "",
          RunNo: item.runNo || "",
          HUB: account.hub || "",
          Branch: account.branch || "",
          CustomerCode: item.accountCode || "",
          CustomerName: item.customer || "",
          State: item.shipperState || "",
          City: item.shipperCity || "",
          Type: account.accountType || "",
          BillingTag: account.billingTag || "",
          GstTag: account.gst || "",
          Currency: item.currency || account.currency || "",
          Sector: item.sector || "",
          DestinationCode: item.destination || "",
          ServiceType: item.service || "",
          Pcs: item.pcs || 0,
          GoodsDesc: item.goodstype || "",
          ActWeight: item.totalActualWt || 0,
          VolWeight: item.totalVolWt || 0,
          VolDiscount: item.volDisc || 0,
          ChgWeight: item.totalVolWt || 0,
          BagWeight: item.bag || 0,
          PaymentType: item.payment || "",
          BasicAmount: item.basicAmt || 0,
          DiscountPerKg: item.discount || 0,
          DiscountAmt: item.discountAmt || 0,
          BasicAmtAfterDiscount: item.basicAmt || 0,
          RateHike: item.hikeAmt || 0,
          SGST: item.sgst || 0,
          CGST: item.cgst || 0,
          IGST: item.igst || item.sgst + item.cgst || 0,
          Handling: item.handlingAmount || 0,
          OVWT: item.overWtHandling || 0,
          Mischg: item.miscChg || 0,
          MiscRemark: item.miscChgReason || "",
          REVENUE: item.basicAmt || 0,
          GrandTotal: item.totalAmt || 0,
        };
      });

      // Add total row - only show "Total" in second last column and amount in last column
      const grandTotalSum = rows.reduce((a, r) => a + (r.GrandTotal || 0), 0);
      rows.push({
        REVENUE: "Total",
        GrandTotal: grandTotalSum,
      });
    }

    // ================== CLIENT WISE ==================
    else if (type === "Client Wise") {
      const clientMap = {};

      shipments.forEach((item) => {
        const account = accountMap[item.accountCode] || {};
        const key = item.accountCode || "UNKNOWN";

        if (!clientMap[key]) {
          clientMap[key] = {
            CustomerCode: item.accountCode || "",
            CustomerName: item.customer || "",
            State: item.shipperState || "",
            City: item.shipperCity || "",
            Type: account.accountType || "",
            BillingTag: account.billingTag || "",
            GstTag: account.gst || "",
            ChgWeight: 0,
            REVENUE: 0,
            IGST: 0,
            GrandTotal: 0,
          };
        }

        clientMap[key].ChgWeight += item.totalVolWt || 0;
        clientMap[key].REVENUE += item.basicAmt || 0;
        clientMap[key].IGST += item.igst || item.sgst + item.cgst || 0;
        clientMap[key].GrandTotal += item.totalAmt || 0;
      });

      rows = Object.values(clientMap);

      // Add total row - only show "Total" in second last column and amount in last column
      const grandTotalSum = rows.reduce((a, r) => a + (r.GrandTotal || 0), 0);
      rows.push({
        IGST: "Total",
        GrandTotal: grandTotalSum,
      });
    }

    // ================== COMPARISON ==================
    else if (type === "Comparison") {
      if (!mode) {
        return NextResponse.json(
          { error: "Missing comparison mode" },
          { status: 400 }
        );
      }

      // Get previous month data for comparison
      const prevMonthRange = getPreviousMonthRange(to);

      // ✅ FIX: Parse previous month dates properly too
      const prevStartDate =
        parseDateFlexible(prevMonthRange.from) || new Date(prevMonthRange.from);
      const prevEndDate =
        parseDateFlexible(prevMonthRange.to) || new Date(prevMonthRange.to);

      prevStartDate.setHours(0, 0, 0, 0);
      prevEndDate.setHours(23, 59, 59, 999);

      const prevQuery = {
        date: { $gte: prevStartDate, $lte: prevEndDate },
      };
      const prevShipments = await Shipment.find(prevQuery).lean();

      // Build previous month account map
      const prevAccountCodes = prevShipments
        .map((s) => s.accountCode)
        .filter(Boolean);
      const prevAccounts = await CustomerAccount.find({
        accountCode: { $in: prevAccountCodes },
      }).lean();
      const prevAccountMap = {};
      prevAccounts.forEach((acc) => (prevAccountMap[acc.accountCode] = acc));

      const groupMap = {};
      const prevGroupMap = {};

      const getKey = (item, accMap) => {
        if (mode === "State") return item.shipperState || "UNKNOWN";
        if (mode === "Product") return item.goodstype || "UNKNOWN";
        if (mode === "Hub") {
          const account = accMap[item.accountCode] || {};
          return account.hub || "UNKNOWN";
        }
        if (mode === "Sec & Hub") {
          const account = accMap[item.accountCode] || {};
          return `${item.sector || "UNKNOWN"}-${account.hub || "UNKNOWN"}`;
        }
        return "UNKNOWN";
      };

      // Process current month data
      shipments.forEach((item) => {
        const key = getKey(item, accountMap);
        const account = accountMap[item.accountCode] || {};

        if (!groupMap[key]) {
          groupMap[key] = {
            key,
            customerCount: new Set(),
            total: 0,
            agentCount: new Set(),
            awbCount: 0,
            chargeableWeight: 0,
            revenue: 0,
            igst: 0,
            grandTotal: 0,
          };
        }

        groupMap[key].customerCount.add(item.accountCode);
        groupMap[key].total += 1;
        if (account.accountType === "Agent") {
          groupMap[key].agentCount.add(item.accountCode);
        }
        groupMap[key].awbCount += 1;
        groupMap[key].chargeableWeight += item.totalVolWt || 0;
        groupMap[key].revenue += item.basicAmt || 0;
        groupMap[key].igst += item.igst || item.sgst + item.cgst || 0;
        groupMap[key].grandTotal += item.totalAmt || 0;
      });

      // Process previous month data
      prevShipments.forEach((item) => {
        const key = getKey(item, prevAccountMap);
        const account = prevAccountMap[item.accountCode] || {};

        if (!prevGroupMap[key]) {
          prevGroupMap[key] = {
            key,
            customerCount: new Set(),
            total: 0,
            agentCount: new Set(),
            awbCount: 0,
            chargeableWeight: 0,
            revenue: 0,
            igst: 0,
            grandTotal: 0,
          };
        }

        prevGroupMap[key].customerCount.add(item.accountCode);
        prevGroupMap[key].total += 1;
        if (account.accountType === "Agent") {
          prevGroupMap[key].agentCount.add(item.accountCode);
        }
        prevGroupMap[key].awbCount += 1;
        prevGroupMap[key].chargeableWeight += item.totalVolWt || 0;
        prevGroupMap[key].revenue += item.basicAmt || 0;
        prevGroupMap[key].igst += item.igst || item.sgst + item.cgst || 0;
        prevGroupMap[key].grandTotal += item.totalAmt || 0;
      });

      // Get month names
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

      const prevStart = new Date(prevMonthRange.from);
      const prevMonthLabel = `GRAND TOTAL ${
        monthNames[prevStart.getMonth()]
      } ${prevStart.getFullYear()}`;

      // Create comparison rows based on mode
      if (mode === "State") {
        const allKeys = new Set([
          ...Object.keys(groupMap),
          ...Object.keys(prevGroupMap),
        ]);

        rows = Array.from(allKeys).map((key) => {
          const current = groupMap[key] || {
            customerCount: new Set(),
            total: 0,
            agentCount: new Set(),
            awbCount: 0,
            chargeableWeight: 0,
            revenue: 0,
            igst: 0,
            grandTotal: 0,
          };
          const previous = prevGroupMap[key] || { grandTotal: 0 };

          return {
            STATE: key,
            CUSTOMER: current.customerCount.size,
            TOTAL: current.total,
            AGENT: current.agentCount.size,
            "#AWB": current.awbCount,
            "CH WT": current.chargeableWeight,
            REVENUE: current.revenue,
            IGST: current.igst,
            "GRAND TOTAL": current.grandTotal,
            [prevMonthLabel]: previous.grandTotal,
            DIFF: current.grandTotal - previous.grandTotal,
          };
        });
      } else if (mode === "Product") {
        const allKeys = new Set([
          ...Object.keys(groupMap),
          ...Object.keys(prevGroupMap),
        ]);

        rows = Array.from(allKeys).map((key) => {
          const current = groupMap[key] || {
            awbCount: 0,
            chargeableWeight: 0,
            revenue: 0,
            igst: 0,
            grandTotal: 0,
          };
          const previous = prevGroupMap[key] || { grandTotal: 0 };

          return {
            PRODUCT: key,
            "#AWB": current.awbCount,
            "CH WT": current.chargeableWeight,
            REVENUE: current.revenue,
            IGST: current.igst,
            "GRAND TOTAL": current.grandTotal,
            [prevMonthLabel]: previous.grandTotal,
            DIFF: current.grandTotal - previous.grandTotal,
          };
        });
      } else if (mode === "Hub") {
        const allKeys = new Set([
          ...Object.keys(groupMap),
          ...Object.keys(prevGroupMap),
        ]);

        rows = Array.from(allKeys).map((key) => {
          const current = groupMap[key] || {
            awbCount: 0,
            chargeableWeight: 0,
            revenue: 0,
            igst: 0,
            grandTotal: 0,
          };
          const previous = prevGroupMap[key] || { grandTotal: 0 };

          return {
            HUB: key,
            "#AWB": current.awbCount,
            "CH WT": current.chargeableWeight,
            REVENUE: current.revenue,
            IGST: current.igst,
            "GRAND TOTAL": current.grandTotal,
            [prevMonthLabel]: previous.grandTotal,
            DIFF: current.grandTotal - previous.grandTotal,
          };
        });
      } else if (mode === "Sec & Hub") {
        // For Sec & Hub, we need hierarchical structure
        const sectorHubMap = {};
        const sectorOnlyMap = {};

        // Separate sectors and sector-hub combinations
        Object.keys(groupMap).forEach((key) => {
          if (key.includes("-")) {
            const [sector, hub] = key.split("-");
            if (!sectorHubMap[sector]) {
              sectorHubMap[sector] = [];
            }
            sectorHubMap[sector].push({
              hub,
              data: groupMap[key],
            });
          } else {
            sectorOnlyMap[key] = groupMap[key];
          }
        });

        // Do the same for previous month data
        const prevSectorHubMap = {};
        const prevSectorOnlyMap = {};

        Object.keys(prevGroupMap).forEach((key) => {
          if (key.includes("-")) {
            const [sector, hub] = key.split("-");
            if (!prevSectorHubMap[sector]) {
              prevSectorHubMap[sector] = [];
            }
            prevSectorHubMap[sector].push({
              hub,
              data: prevGroupMap[key],
            });
          } else {
            prevSectorOnlyMap[key] = prevGroupMap[key];
          }
        });

        rows = [];

        // Get all sectors (from both current and previous)
        const allSectors = new Set([
          ...Object.keys(sectorHubMap),
          ...Object.keys(sectorOnlyMap),
          ...Object.keys(prevSectorHubMap),
          ...Object.keys(prevSectorOnlyMap),
        ]);

        allSectors.forEach((sector) => {
          // Add sector row first (this will be bold)
          const sectorCurrent = sectorOnlyMap[sector] || {
            awbCount: 0,
            chargeableWeight: 0,
            revenue: 0,
            igst: 0,
            grandTotal: 0,
          };
          const sectorPrevious = prevSectorOnlyMap[sector] || { grandTotal: 0 };

          rows.push({
            "SEC & HUB": sector,
            "#AWB": sectorCurrent.awbCount,
            "CH WT": sectorCurrent.chargeableWeight,
            REVENUE: sectorCurrent.revenue,
            IGST: sectorCurrent.igst,
            "GRAND TOTAL": sectorCurrent.grandTotal,
            [prevMonthLabel]: sectorPrevious.grandTotal,
            DIFF: sectorCurrent.grandTotal - sectorPrevious.grandTotal,
            isSector: true, // Flag to identify sector rows for styling
          });

          // Add hub rows for this sector
          const hubsForSector = sectorHubMap[sector] || [];
          const prevHubsForSector = prevSectorHubMap[sector] || [];

          // Get all hubs for this sector
          const allHubs = new Set([
            ...hubsForSector.map((h) => h.hub),
            ...prevHubsForSector.map((h) => h.hub),
          ]);

          allHubs.forEach((hub) => {
            const hubData = hubsForSector.find((h) => h.hub === hub)?.data || {
              awbCount: 0,
              chargeableWeight: 0,
              revenue: 0,
              igst: 0,
              grandTotal: 0,
            };
            const prevHubData = prevHubsForSector.find((h) => h.hub === hub)
              ?.data || { grandTotal: 0 };

            rows.push({
              "SEC & HUB": hub,
              "#AWB": hubData.awbCount,
              "CH WT": hubData.chargeableWeight,
              REVENUE: hubData.revenue,
              IGST: hubData.igst,
              "GRAND TOTAL": hubData.grandTotal,
              [prevMonthLabel]: prevHubData.grandTotal,
              DIFF: hubData.grandTotal - prevHubData.grandTotal,
              isSector: false, // Hub row
            });
          });
        });
      }

      // Add totals row - full totals for all numeric columns
      const currentTotals = Object.values(groupMap).reduce(
        (acc, curr) => ({
          customerCount:
            mode === "State"
              ? new Set([...acc.customerCount, ...curr.customerCount])
              : new Set(),
          total: acc.total + curr.total,
          agentCount:
            mode === "State"
              ? new Set([...acc.agentCount, ...curr.agentCount])
              : new Set(),
          awbCount: acc.awbCount + curr.awbCount,
          chargeableWeight: acc.chargeableWeight + curr.chargeableWeight,
          revenue: acc.revenue + curr.revenue,
          igst: acc.igst + curr.igst,
          grandTotal: acc.grandTotal + curr.grandTotal,
        }),
        {
          customerCount: new Set(),
          total: 0,
          agentCount: new Set(),
          awbCount: 0,
          chargeableWeight: 0,
          revenue: 0,
          igst: 0,
          grandTotal: 0,
        }
      );

      const prevTotals = Object.values(prevGroupMap).reduce(
        (acc, curr) => ({
          grandTotal: acc.grandTotal + curr.grandTotal,
        }),
        { grandTotal: 0 }
      );

      if (mode === "State") {
        rows.push({
          STATE: "Total",
          CUSTOMER: currentTotals.customerCount.size,
          TOTAL: currentTotals.total,
          AGENT: currentTotals.agentCount.size,
          "#AWB": currentTotals.awbCount,
          "CH WT": currentTotals.chargeableWeight,
          REVENUE: currentTotals.revenue,
          IGST: currentTotals.igst,
          "GRAND TOTAL": currentTotals.grandTotal,
          [prevMonthLabel]: prevTotals.grandTotal,
          DIFF: currentTotals.grandTotal - prevTotals.grandTotal,
        });
      } else if (mode === "Sec & Hub") {
        // For Sec & Hub, only total sectors (not hubs) - sum only rows with isSector: true
        const sectorOnlyTotals = rows
          .filter((row) => row.isSector === true)
          .reduce(
            (acc, row) => ({
              awbCount: acc.awbCount + (row["#AWB"] || 0),
              chargeableWeight: acc.chargeableWeight + (row["CH WT"] || 0),
              revenue: acc.revenue + (row.REVENUE || 0),
              igst: acc.igst + (row.IGST || 0),
              grandTotal: acc.grandTotal + (row["GRAND TOTAL"] || 0),
              prevGrandTotal: acc.prevGrandTotal + (row[prevMonthLabel] || 0),
            }),
            {
              awbCount: 0,
              chargeableWeight: 0,
              revenue: 0,
              igst: 0,
              grandTotal: 0,
              prevGrandTotal: 0,
            }
          );

        rows.push({
          "SEC & HUB": "Total",
          "#AWB": sectorOnlyTotals.awbCount,
          "CH WT": sectorOnlyTotals.chargeableWeight,
          REVENUE: sectorOnlyTotals.revenue,
          IGST: sectorOnlyTotals.igst,
          "GRAND TOTAL": sectorOnlyTotals.grandTotal,
          [prevMonthLabel]: sectorOnlyTotals.prevGrandTotal,
          DIFF: sectorOnlyTotals.grandTotal - sectorOnlyTotals.prevGrandTotal,
          isSector: false,
        });
      } else {
        // For Product and Hub modes
        const totalRow = {
          "#AWB": currentTotals.awbCount,
          "CH WT": currentTotals.chargeableWeight,
          REVENUE: currentTotals.revenue,
          IGST: currentTotals.igst,
          "GRAND TOTAL": currentTotals.grandTotal,
          [prevMonthLabel]: prevTotals.grandTotal,
          DIFF: currentTotals.grandTotal - prevTotals.grandTotal,
        };

        if (mode === "Product") {
          totalRow.PRODUCT = "Total";
        } else if (mode === "Hub") {
          totalRow.HUB = "Total";
        }

        rows.push(totalRow);
      }
    }

    // ================== EXCEL GENERATION ==================
    const workbook = new ExcelJS.Workbook();
    const sheetName = type === "Comparison" ? `${type} - ${mode}` : type;
    const sheet = workbook.addWorksheet(sheetName);

    if (rows.length > 0) {
      // Create columns from the first row keys
      sheet.columns = Object.keys(rows[0]).map((key) => ({
        header: key.toUpperCase(),
        key: key,
        width: key.length > 15 ? 25 : 20,
      }));

      // Add all rows to the sheet
      rows.forEach((row, index) => {
        // Remove the isSector flag before adding to Excel
        const { isSector, ...cleanRow } = row;
        sheet.addRow(cleanRow);
      });

      // Style the header row with light green background
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD4F4DD" }, // Light green
        };
        cell.font = { bold: true };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Style sector rows in Sec & Hub mode (make them bold)
      if (type === "Comparison" && mode === "Sec & Hub") {
        rows.forEach((row, index) => {
          if (row.isSector === true) {
            const rowNumber = index + 2; // +2 because Excel is 1-indexed and we have a header
            const excelRow = sheet.getRow(rowNumber);
            excelRow.eachCell((cell) => {
              cell.font = { bold: true };
            });
          }
        });
      }

      // Style the total row (last row) with light red background
      const totalRowNumber = sheet.rowCount;
      const totalRow = sheet.getRow(totalRowNumber);
      totalRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFCCCC" }, // Light red
        };
        cell.font = { bold: true };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename =
      type === "Comparison"
        ? `${type}_${mode.replace(/ & /g, "_")}_Report.xlsx`
        : `${type.replace(/ /g, "_")}_Report.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Disposition": `attachment; filename=${filename}`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (err) {
    console.error("Excel export failed:", err);
    return NextResponse.json(
      { error: "Failed to export excel" },
      { status: 500 }
    );
  }
}
