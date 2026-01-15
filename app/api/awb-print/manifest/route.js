import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET(request) {
  await connectDB();

  const { searchParams } = new URL(request.url);
  const manifestNo = searchParams.get("manifestNo");

  if (!manifestNo) {
    return NextResponse.json(
      { error: "Manifest number is required" },
      { status: 400 }
    );
  }

  const shipments = await Shipment.find({ manifestNo }).lean();

  if (!shipments.length) {
    return NextResponse.json({ error: "No shipments found" }, { status: 404 });
  }

  const invoiceDataList = shipments.map((shipment) => ({
    company: shipment.company,
    destination: shipment.destination,
    awbNo: shipment.awbNo,
    date: shipment.date
      ? shipment.date.toLocaleDateString()
      : shipment.createdAt.toLocaleDateString(),
    shipperName: shipment.shipperFullName,
    shipperAddress: [shipment.shipperAddressLine1, shipment.shipperAddressLine2]
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
    accountCode: shipment.accountCode || "",
  }));

  return NextResponse.json(invoiceDataList);
}
