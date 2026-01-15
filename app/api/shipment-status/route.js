import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import RunEntry from "@/app/model/RunEntry";
import ChildShipment from "@/app/model/portal/ChildShipment";

function formatDateYYYYMMDD(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export async function POST(req) {
  try {
    await connectDB();

    const filters = await req.json();
    const { from, to } = filters;

    let query = {};

    // 🔹 Counterpart filter via RunEntry
    if (filters.counterPart) {
      const runs = await RunEntry.find(
        { counterpart: new RegExp(filters.counterPart, "i") },
        { runNo: 1 }
      ).lean();

      const runNos = runs.map((r) => r.runNo);
      if (!runNos.length) return NextResponse.json([], { status: 200 });

      query.runNo = { $in: runNos };
    }

    if (filters.runNumber) {
      query.runNo = query.runNo?.$in
        ? {
            $in: query.runNo.$in.filter((r) =>
              r.toLowerCase().includes(filters.runNumber.toLowerCase())
            ),
          }
        : { $regex: filters.runNumber, $options: "i" };
    }

    // Date filter
    if (from || to) {
      const fromDate = from ? new Date(from) : new Date("1970-01-01");
      const toDate = to ? new Date(to) : new Date();
      query.createdAt = { $gte: fromDate, $lte: toDate };
    }

    // Other filters
    if (filters.code)
      query.accountCode = { $regex: filters.code, $options: "i" };
    if (filters.client)
      query.customer = { $regex: filters.client, $options: "i" };
    if (filters.branch)
      query.branch = { $regex: filters.branch, $options: "i" };
    if (filters.origin)
      query.origin = { $regex: filters.origin, $options: "i" };
    if (filters.sector)
      query.sector = { $regex: filters.sector, $options: "i" };
    if (filters.status && filters.status !== "All")
      query.status = { $regex: filters.status, $options: "i" };
    if (filters.destination)
      query.destination = { $regex: filters.destination, $options: "i" };
    if (filters.network)
      query.network = { $regex: filters.network, $options: "i" };
    if (filters.service)
      query.service = { $regex: filters.service, $options: "i" };

    // 🔹 Parent shipments
    let parents = await Shipment.find(query).lean();

    // 🔹 Counterpart mapping
    const runNos = [...new Set(parents.map((p) => p.runNo))];
    const runEntries = await RunEntry.find(
      { runNo: { $in: runNos } },
      { runNo: 1, counterpart: 1 }
    ).lean();

    const counterpartMap = {};
    runEntries.forEach((r) => (counterpartMap[r.runNo] = r.counterpart));

    parents = parents.map((p) => ({
      ...p,
      counterpart: counterpartMap[p.runNo] || "",
    }));

    // 🔹 Child shipments
    const parentAwbs = parents.map((p) => p.awbNo).filter(Boolean);

    const children = await ChildShipment.find({
      $or: [
        { masterAwbNo: { $in: parentAwbs } },
        { MAWB: { $in: parentAwbs } },
      ],
    }).lean();

    const childMap = {};
    children.forEach((c) => {
      const key = c.masterAwbNo || c.MAWB;
      if (!childMap[key]) childMap[key] = [];
      childMap[key].push(c);
    });

    // 🔹 Combine parent + child
    let result = [];

    parents.forEach((parent) => {
      // Parent row
      result.push({
        ...parent,
        alMawb: parent.awbNo,
        isChild: false,
      });

      // Child rows
      (childMap[parent.awbNo] || []).forEach((child) => {
        result.push({
          ...parent,
          awbNo: child.childAwbNo,
          mAwb: parent.awbNo,
          receiverFullName: child.consigneeName || "",
          receiverAddressLine1: child.receiverAddressLine1 || "",
          destination: child.destination || parent.destination,
          pcs: child.pcs || parent.pcs,
          goodstype: child.goodstype || parent.goodstype,
          totalActualWt: child.totalActualWt || parent.totalActualWt,
          createdAt: child.createdAt || parent.createdAt,
          isChild: true,
          _id: child._id,
        });
      });
    });

    // Fetch branch data from CustomerAccount for each shipment
    const shipmentsWithBranch = await Promise.all(
      shipments.map(async (shipment) => {
        let branch = shipment.branch || "";
        
        // If branch is not in shipment, fetch from CustomerAccount
        if (!branch && shipment.accountCode) {
          const customerAccount = await CustomerAccount.findOne({
            accountCode: shipment.accountCode
          }).select("branch").lean();
          
          if (customerAccount) {
            branch = customerAccount.branch || "";
          }
        }

        return {
          ...shipment,
          branch,
          date: shipment.date ? formatDateYYYYMMDD(shipment.date) : null,
          shipmentDate: shipment.shipmentDate ? formatDateYYYYMMDD(shipment.shipmentDate) : null,
          createdAt: shipment.createdAt ? formatDateYYYYMMDD(shipment.createdAt) : null,
        };
      })
    );

    return NextResponse.json(shipmentsWithBranch, { status: 200 });
    // 🔹 Format dates
    result = result.map((s) => ({
      ...s,
      createdAt: s.createdAt ? formatDateYYYYMMDD(s.createdAt) : null,
    }));

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error fetching shipments:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching shipments." },
      { status: 500 }
    );
  }
}