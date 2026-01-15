import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db"; // Database connection utility
import AccountLedger from "@/app/model/AccountLedger";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
// Connect to the database
await connectDB();

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    if (!code) {
      return NextResponse.json(
        { success: false, message: "Missing accountCode (code)" },
        { status: 400 }
      );
    }

    // Fetch shipments
    const shipments = await Shipment.find({ accountCode: code }).lean();

    // Fetch customer info
    const customer = await CustomerAccount.findOne({ code }).lean();

    if (!shipments || shipments.length === 0) {
      return NextResponse.json(
        {
          customerName: customer?.name || "",
          email: customer?.email || "",
          openingBalance: customer?.openingBalance || 0,
          balance: 0,
          shipments: [],
        },
        { status: 200 }
      );
    }

    const rowData = shipments.map((s, idx) => ({
      SrNo: idx + 1,
      AwbNo: s.awbNo,
      Type: s.shipmentType,
      Date: s.date,
      Consignee: s.receiverFullName,
      Forwarder: s.forwarder,
      ForwarderNo: s.forwardingNo,
      RunNo: s.runNo,
      Sector: s.sector,
      Destination: s.destination,
      City: s.receiverCity,
      ZipCode: s.receiverPincode,
      Service: s.goodstype,
      Pcs: s.pcs,
      ActualWeight: s.totalActualWt,
      VolWeight: s.totalVolWt,
      ChgWeight: Math.max(s.totalActualWt, s.totalVolWt),
      DiscountPerKg: s.discount,
      DiscountAmount: s.discountAmt,
      DiscountTotal: s.discountAmt,
      RateHike: s.hikeAmt,
      SGST: s.sgst,
      CGST: s.cgst,
      IGST: s.igst,
      Mischg: s.miscChg,
      Fuel: s.fuelAmt,
      NonTaxable: 0,
      GrandTotal: s.totalAmt,
      RcvAount: 0,
      DebitAmount: 0,
      CreditAmount: 0,
      Balance: s.totalAmt,
      Remark: s.operationRemark,
      isHold: s.isHold || false,
    }));

    const totalBalance = shipments.reduce((acc, s) => acc + (s.totalAmt || 0), 0);

    return NextResponse.json(
      {
        customerName: customer?.name || "",
        email: customer?.email || "",
        openingBalance: customer?.openingBalance || 0,
        balance: totalBalance,
        shipments: rowData,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching account ledger:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const data = await req.json();

    // Insert a new ledger entry
    const newLedger = await AccountLedger.create(data);
    return NextResponse.json(
      { success: true, data: newLedger },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 400 }
    );
  }
}

export async function PUT(req, { params }) {
  const { id } = params;
  try {
    const updatedLedger = await AccountLedger.findByIdAndUpdate(
      id,
      await req.json(),
      { new: true, runValidators: true }
    );

    if (!updatedLedger) {
      return NextResponse.json(
        { success: false, message: "Ledger not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: updatedLedger },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(req, { params }) {
  const { id } = params;
  try {
    const deletedLedger = await AccountLedger.findByIdAndDelete(id);

    if (!deletedLedger) {
      return NextResponse.json(
        { success: false, message: "Ledger not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Ledger deleted successfully." },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
