import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RunEntry from "@/app/model/RunEntry";
import BranchBagging from "@/app/model/BranchBagging";
import Shipment from "@/app/model/portal/Shipment";
import Invoice from "@/app/model/Invoice";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return NextResponse.json(
        { error: "Run number is required" },
        { status: 400 }
      );
    }

    // Find the run record by runNo
    const run = await RunEntry.findOne({ runNo }).lean();

    if (!run) {
      return NextResponse.json(
        { error: "Run number not found" },
        { status: 404 }
      );
    }

    // Validate accountType
    if (run.accountType !== "branchHub" && run.accountType !== "hubHub") {
      return NextResponse.json(
        { error: `Invalid account type. This run has accountType: ${run.accountType}. Only branchHub and hubHub are allowed.` },
        { status: 400 }
      );
    }

    // Find the branch bagging record by runNo
    const branchBagging = await BranchBagging.findOne({ runNo }).lean();

    if (!branchBagging) {
      return NextResponse.json(
        { error: "Branch bagging data not found for this run number" },
        { status: 404 }
      );
    }

    // Extract AWB numbers from rowData
    const awbNumbers = branchBagging.rowData
      .map((row) => row.awbNo || row.childShipment)
      .filter(Boolean);

    if (awbNumbers.length === 0) {
      return NextResponse.json({
        success: true,
        runData: {
          runNo: run.runNo,
          date: run.date || "",
          sector: run.sector || "",
          alMawb: run.almawb || "",
          obc: run.obc || "",
          counterPart: run.counterpart || "",
          flight: run.flight || run.flightnumber || "",
          accountType: run.accountType,
        },
        tableData: [],
      });
    }

    // Fetch shipments for these AWB numbers
    const shipments = await Shipment.find({
      awbNo: { $in: awbNumbers },
    }).lean();

    // Create a map for quick lookup
    const shipmentMap = {};
    shipments.forEach((shipment) => {
      shipmentMap[shipment.awbNo] = shipment;
    });

    // Fetch invoices for these shipments to get grand total
    const invoices = await Invoice.find({
      "shipments.awbNo": { $in: awbNumbers },
    }).lean();

    // Create invoice map for grand total lookup
    const invoiceMap = {};
    invoices.forEach((invoice) => {
      invoice.shipments.forEach((ship) => {
        if (!invoiceMap[ship.awbNo]) {
          invoiceMap[ship.awbNo] = invoice.invoiceSummary?.grandTotal || 0;
        }
      });
    });

    // Build table data
    const tableData = awbNumbers.map((awbNo, index) => {
      const shipment = shipmentMap[awbNo] || {};
      const grandTotal = invoiceMap[awbNo] || 0;

      // Consignor name only
      const consignorName = shipment.shipperFullName || "N/A";

      // Consignor address
      const consignorAddress = [
        shipment.shipperAddressLine1,
        shipment.shipperAddressLine2,
        shipment.shipperCity,
        shipment.shipperState,
        shipment.shipperPincode,
      ]
        .filter(Boolean)
        .join(", ");

      // Consignee name only
      const consigneeName = shipment.receiverFullName || "N/A";

      // Consignee address
      const consigneeAddress = [
        shipment.receiverAddressLine1,
        shipment.receiverAddressLine2,
        shipment.receiverCity,
        shipment.receiverState,
        shipment.receiverPincode,
      ]
        .filter(Boolean)
        .join(", ");

      // Combine content array to string
      const content = Array.isArray(shipment.content)
        ? shipment.content.join(", ")
        : shipment.content || "";

      return {
        srNo: index + 1,
        awbNo: awbNo,
        consignorName: consignorName,
        consignorAddress: consignorAddress || "N/A",
        consigneeName: consigneeName,
        consigneeAddress: consigneeAddress || "N/A",
        pcs: shipment.pcs || 0,
        totalActualWeight: shipment.totalActualWt || 0,
        content: content || "N/A",
        grandTotal: grandTotal,
        gst: "N/A",
        gstIn: "",
        sector: shipment.sector || "N/A",
        whethe: "N/A",
        wheth: "N/A",
        totalIg: "N/A",
      };
    });

    return NextResponse.json({
      success: true,
      runData: {
        runNo: run.runNo,
        date: run.date || "",
        sector: run.sector || "",
        alMawb: run.almawb || "",
        obc: run.obc || "",
        counterPart: run.counterpart || "",
        flight: run.flight || run.flightnumber || "",
        accountType: run.accountType,
      },
      tableData,
    });
  } catch (error) {
    console.error("Error fetching manifest data:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch manifest data",
        details: error.message 
      },
      { status: 500 }
    );
  }
}