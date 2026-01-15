import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET(request) {
  await connectDB();

  const { searchParams } = new URL(request.url);
  const awbNo = searchParams.get("awbNo");

  if (!awbNo) {
    return NextResponse.json(
      { error: "AWB number is required" },
      { status: 400 }
    );
  }

  const shipment = await Shipment.findOne({ awbNo }).lean();

  if (!shipment) {
    return NextResponse.json({ error: "AWB not found" }, { status: 404 });
  }

  const invoiceData = {
    company: shipment.company,
    destination: shipment.destination,
    awbNo: shipment.awbNo,
    date: shipment.date ? shipment.date.toLocaleDateString() : "" || shipment.createdAt.toLocaleDateString(),
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
  };

  return NextResponse.json(invoiceData);
}
