import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import Invoice from "@/app/model/Invoice";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const branch = url.searchParams.get("branch");
    const search = url.searchParams.get("search") || "";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!branch) {
      return NextResponse.json(
        { error: "Branch is required" },
        { status: 400 }
      );
    }

    // 1️⃣ Find customers by branch + search
    const baseCustomers = await CustomerAccount.find({
      branch,
      $or: [
        { name: { $regex: search, $options: "i" } },
        { accountCode: { $regex: search, $options: "i" } },
      ],
    });

    // If no date filter → return branch filtered customers
    if (!from || !to) {
      return NextResponse.json(baseCustomers, { status: 200 });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    // 2️⃣ Grab all accountCodes on this branch
    const codes = baseCustomers.map((c) => c.accountCode);

    if (!codes.length) {
      return NextResponse.json([], { status: 200 });
    }

    // 3️⃣ Find shipments within range for these accounts
    const shipments = await Shipment.find({
      accountCode: { $in: codes },
      billingLocked: true,
      isBilled: { $ne: true },
      date: { $gte: fromDate, $lte: toDate },
    }).distinct("accountCode");

    // 4️⃣ Return customers that have shipments
    const result = baseCustomers.filter((c) =>
      shipments.includes(c.accountCode)
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch accounts", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    await connectDB();
    const {
      invoices,
      branch,
      createdBy,
      invoiceDate,
      fromDate,
      toDate,
      financialYear,
    } = await req.json();

    if (!invoices || invoices.length === 0) {
      return NextResponse.json(
        { success: false, message: "No invoices provided" },
        { status: 400 }
      );
    }

    // get the latest invoice sr number
    const last = await Invoice.findOne().sort({ invoiceSrNo: -1 });
    let nextSrNo = last ? last.invoiceSrNo + 1 : 1;

    const date = new Date(invoiceDate);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const formattedDate = `${yyyy}${mm}${dd}`;

    const saved = [];

    for (const inv of invoices) {
      // skip empty shipment
      if (!inv.shipments || inv.shipments.length === 0) continue;

      const invoiceNumber = `${branch}/${formattedDate}/${String(
        nextSrNo
      ).padStart(3, "0")}`;

      const newInvoice = new Invoice({
        invoiceSrNo: nextSrNo,
        invoiceNumber,
        invoiceDate,
        fromDate,
        toDate,
        branch,
        createdBy,
        customer: inv.customer,
        shipments: inv.shipments,
        invoiceSummary: inv.summary,
        financialYear,
        placeOfSupply: inv.customer.state,
        totalAwb: inv.summary.totalAwb,
      });

      await newInvoice.save();
      saved.push(invoiceNumber);

      // mark shipments billed
      const awbNos = inv.shipments.map((s) => s.awbNo);
      await Shipment.updateMany(
        { awbNo: { $in: awbNos } },
        { $set: { isBilled: true, invoiceNumber, billNo: invoiceNumber } }
      );

      nextSrNo++;
    }

    return NextResponse.json({
      success: true,
      message: `${saved.length} invoices created`,
      createdInvoices: saved,
    });
  } catch (err) {
    console.error("Bulk Invoice Error:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
