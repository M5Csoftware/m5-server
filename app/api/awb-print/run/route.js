import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import Shipment from "@/app/model/portal/Shipment"; // to get invoice details
import { NextResponse } from "next/server";

export async function GET(request) {
  await connectDB();

  const { searchParams } = new URL(request.url);
  const runNo = searchParams.get("runNo");
  const bagNo = searchParams.get("bagNo"); // optional

  console.log("Incoming request:", { runNo, bagNo });

  if (!runNo) {
    console.log("❌ Run number missing");
    return NextResponse.json(
      { error: "Run number is required" },
      { status: 400 }
    );
  }

  try {
    // Fetch bagging document for the run
    const bagging = await Bagging.findOne({ runNo }).lean();
    if (!bagging) {
      console.log(`❌ No bagging found for runNo=${runNo}`);
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    console.log("✅ Found bagging:", bagging._id, "rowData length:", bagging.rowData.length);

    // Filter rowData if bagNo is provided
    const filteredRows = bagNo
      ? bagging.rowData.filter((r) => r.bagNo === bagNo)
      : bagging.rowData;

    console.log("Filtered rows count:", filteredRows.length);

    // Fetch shipment/invoice details for each AWB
    const invoices = await Promise.all(
      filteredRows.map(async (row) => {
        const shipment = await Shipment.findOne({ awbNo: row.awbNo }).lean();
        if (!shipment) {
          console.log(`⚠️ Shipment not found for AWB: ${row.awbNo}`);
          return null;
        }

        return {
          destination: shipment.destination,
          accountCode: shipment.accountCode,
          awbNo: shipment.awbNo,
          date: shipment.date
            ? shipment.date.toLocaleDateString()
            : shipment.createdAt.toLocaleDateString(),
          shipperName: shipment.shipperFullName,
          shipperAddress: [
            shipment.shipperAddressLine1,
            shipment.shipperAddressLine2,
          ]
            .filter(Boolean)
            .join(", "),
          shipperPhone: shipment.shipperPhoneNumber,
          consigneeName: shipment.receiverFullName,
          consigneeAddress: [
            shipment.receiverAddressLine1,
            shipment.receiverAddressLine2,
          ]
            .filter(Boolean)
            .join(", "),
          consigneePhone: shipment.receiverPhoneNumber,
          content: shipment.content || [],
          pcs: shipment.pcs || 0,
          totalActualWt: shipment.totalActualWt || 0,
          totalVolWt: shipment.totalVolWt || 0,
          totalInvoiceValue: shipment.totalInvoiceValue || 0,
          payment: shipment.payment,
          bagNo: row.bagNo,
          bagWeight: row.bagWeight,
          runNo: row.runNo,
          forwardingNo: row.forwardingNo || "",
        };
      })
    );

    const finalInvoices = invoices.filter(Boolean);
    console.log("Final invoices count:", finalInvoices.length);

    if (finalInvoices.length === 0) {
      console.log("❌ No shipments found for this run/bag");
      return NextResponse.json(
        { error: "No shipments found for this run/bag" },
        { status: 404 }
      );
    }

    return NextResponse.json(finalInvoices);
  } catch (err) {
    console.error("💥 Server error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
