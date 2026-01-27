import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import AccountLedger from "@/app/model/AccountLedger";

// Ensure DB connection
connectDB();

export async function PUT(req) {
  try {
    await connectDB();

    const body = await req.json();
    const awbNo = req.nextUrl.searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json(
        { error: "awbNo is required for update" },
        { status: 400 },
      );
    }

    // Find the shipment
    const shipment = await Shipment.findOne({ awbNo });
    if (!shipment) {
      return NextResponse.json(
        { error: "Shipment not found" },
        { status: 404 },
      );
    }

    // Find customer
    const customer = await CustomerAccount.findOne({
      accountCode: body.accountCode.toUpperCase(),
    });
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Calculate the difference in grand total
    const oldGrandTotal = shipment.totalAmt || 0;
    const newGrandTotal = Number(body.grandTotal || 0);
    const difference = newGrandTotal - oldGrandTotal;

    // Update customer balance
    let updatedBalance = customer.leftOverBalance || 0;
    updatedBalance += difference;

    customer.leftOverBalance = updatedBalance;
    await customer.save();

    // Update Account Ledger
    const accountLedger = await AccountLedger.findOne({ awbNo });

    if (accountLedger) {
      accountLedger.service = body.service;
      accountLedger.basicAmt = Number(body.basicAmount || 0);
      accountLedger.sgst = Number(body.sgst || 0);
      accountLedger.cgst = Number(body.cgst || 0);
      accountLedger.igst = Number(body.igst || 0);
      accountLedger.totalAmt = newGrandTotal;
      accountLedger.leftOverBalance = updatedBalance;

      await accountLedger.save();
    }

    // Helper: Parse date string
    const parseDateString = (dateStr) => {
      if (!dateStr) return null;
      if (typeof dateStr === "string" && dateStr.includes("/")) {
        const [day, month, year] = dateStr.split("/");
        return new Date(`${year}-${month}-${day}`);
      }
      return new Date(dateStr);
    };

    // Update only the specific fields for auto-calculation
    const updateData = {
      service: body.service,
      basicAmt: Number(body.basicAmount || 0),
      cgst: Number(body.cgst || 0),
      sgst: Number(body.sgst || 0),
      igst: Number(body.igst || 0),
      totalAmt: newGrandTotal,
      date: parseDateString(body.date),
      updateUser: body.updateUser || "Auto Calculation",
    };

    // NEW: Set isHold to false and clear holdReason for shipments that were on hold
    if (shipment.isHold === true) {
      updateData.isHold = false;
      updateData.holdReason = "";
      console.log(
        `Shipment ${awbNo} was on hold. Setting isHold to false and clearing holdReason.`,
      );
    }

    // Update the shipment
    const updatedShipment = await Shipment.findOneAndUpdate(
      { awbNo },
      updateData,
      { new: true },
    );

    if (!updatedShipment) {
      return NextResponse.json(
        { error: "Failed to update shipment" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        shipment: updatedShipment,
        wasHoldReleased: shipment.isHold === true,
        balanceUpdate: {
          oldBalance: customer.leftOverBalance + difference,
          newBalance: updatedBalance,
          difference: difference,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "Error in auto-calculation update:",
      error.message,
      error.stack,
    );
    return NextResponse.json(
      { error: "Failed to update shipment", details: error.message },
      { status: 400 },
    );
  }
}
