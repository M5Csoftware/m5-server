import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import AccountLedger from "@/app/model/AccountLedger";
import ChildShipment from "@/app/model/portal/ChildShipment";

// Ensure DB connection
connectDB();

export async function GET(req) {
  await connectDB();

  const awbNo = req.nextUrl.searchParams.get("awbNo");
  if (!awbNo) {
    return NextResponse.json(null, { status: 400 });
  }

  // 1. Try master shipment
  const shipment = await Shipment.findOne({ awbNo }).lean();

  if (shipment) {
    return NextResponse.json({
      forwarder: shipment.forwarder,
      forwardingNo: shipment.forwardingNo,
      source: "master",
    });
  }

  // 2. Try child shipment
  const child = await ChildShipment.findOne({
    $or: [{ childAwbNo: awbNo }],
  }).lean();

  if (!child) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json({
    forwarder: child.forwarder,
    forwardingNo: child.forwardingNo,
    source: "child",
  });
}

export async function PUT(req) {
  await connectDB();

  const enteredAwb = req.nextUrl.searchParams.get("awbNo");
  const body = await req.json();

  if (!enteredAwb) {
    return NextResponse.json({ error: "awbNo required" }, { status: 400 });
  }

  // 1️⃣ Try MASTER shipment
  const shipment = await Shipment.findOneAndUpdate(
    { awbNo: enteredAwb },
    {
      $set: {
        forwarder: body.forwarder,
        forwardingNo: body.fwdNumber,
      },
    },
    { new: true }
  );

  if (shipment) {
    // MASTER → update ledger only
    await AccountLedger.updateOne(
      { awbNo: enteredAwb },
      {
        $set: {
          forwarder: body.forwarder,
          forwardingNo: body.fwdNumber,
        },
      }
    );

    return NextResponse.json({
      updated: "shipment",
      awbNo: enteredAwb,
    });
  }

  // 2️⃣ Try CHILD shipment
  const child = await ChildShipment.findOneAndUpdate(
    { childAwbNo: enteredAwb },
    {
      $set: {
        forwarder: body.forwarder,
        forwardingNo: body.fwdNumber,
      },
    },
    { new: true }
  );

  if (child) {
    return NextResponse.json({
      updated: "childShipment",
      childAwbNo: enteredAwb,
    });
  }

  // 3️⃣ Nothing found
  return NextResponse.json(
    { error: "Invalid AWB / Child number" },
    { status: 404 }
  );
}
