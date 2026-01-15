import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

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

    // Fetch shipments for this account
    const shipments = await Shipment.find({ accountCode: code }).lean();

    if (!shipments || shipments.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    // Convert shipments into table-friendly format
    // REMOVED: .filter((s) => !s.isHold) - now sending ALL records
    const rowData = shipments.map((s, idx) => {
      // Determine SaleType
      const saleType = s.payment === "Credit" ? "Sale" : s.payment;

      // If SaleType is RTO or FOC, zero out SaleAmount and GrandTotal
      const saleAmount = ["RTO", "FOC"].includes(saleType) ? 0 : s.basicAmt;
      const grandTotal = ["RTO", "FOC"].includes(saleType) ? 0 : s.totalAmt;
      const balance = ["RTO", "FOC"].includes(saleType) ? 0 : s.totalAmt;

      return {
        SrNo: idx + 1,
        AwbNo: s.awbNo,
        Type: s.shipmentType,
        Date: s.date,
        code: s.accountCode,
        Consignee: s.receiverFullName,
        Forwarder: s.forwarder,
        ForwarderNo: s.forwardingNo,
        RunNo: s.runNo,
        Sector: s.sector,
        Destination: s.destination,
        City: s.receiverCity,
        ZipCode: s.receiverPincode,
        Service: s.service,
        Pcs: s.pcs,
        ActualWeight: s.totalActualWt,
        VolWeight: s.totalVolWt,
        ChgWeight: Math.max(s.totalActualWt, s.totalVolWt),
        SaleAmount: saleAmount, // ✅ use computed value
        SaleType: saleType,
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
        GrandTotal: grandTotal,
        RcvAount: 0,
        DebitAmount: 0,
        CreditAmount: 0,
        Balance: balance,
        Remark: s.operationRemark,
        isHold: s.isHold, // ✅ This field is preserved
        ReferenceNo: s.reference,
      };
    });

    // Calculate balances based on non-hold shipments only
    const nonHoldShipments = shipments.filter((s) => !s.isHold);

    // Opening balance = first non-hold shipment total
    const openingBalance = nonHoldShipments[0]?.totalAmt || 0;

    // Leftover balance = sum of non-hold shipment totals
    const leftOverBalance = nonHoldShipments.reduce(
      (acc, s) => acc + (s.totalAmt || 0),
      0
    );

    return NextResponse.json(
      {
        code,
        customerName: shipments[0]?.customer || "",
        openingBalance,
        balance: leftOverBalance,
        shipments: rowData, // ✅ Now includes ALL shipments (hold and non-hold)
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching account ledger:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
