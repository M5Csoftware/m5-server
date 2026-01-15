import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
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
    const { from, to, singleForwarding } = filters;

    let query = {};

    // 🔹 Handle Counter Part filter via RunEntry
    if (filters.counterPart) {
      const runs = await RunEntry.find(
        { counterpart: new RegExp(filters.counterPart, "i") },
        { runNo: 1 }
      ).lean();

      const runNos = runs.map((r) => r.runNo);

      if (runNos.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      query.runNo = { $in: runNos };
    }

    if (filters.runNumber) {
      if (query.runNo?.$in) {
        query.runNo = {
          $in: query.runNo.$in.filter((rn) =>
            rn.toLowerCase().includes(filters.runNumber.toLowerCase())
          ),
        };
      } else {
        query.runNo = { $regex: filters.runNumber, $options: "i" };
      }
    }

    // Only add createdAt filter if from/to exist
    if (from || to) {
      const fromDate = from ? new Date(from) : new Date("1970-01-01");
      const toDate = to ? new Date(to) : new Date();

      if (fromDate > toDate) {
        return NextResponse.json(
          { error: "'From' date cannot be later than 'To' date" },
          { status: 400 }
        );
      }

      query.createdAt = { $gte: fromDate, $lte: toDate };
    }

    // ✅ All other filters remain
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

    // Fetch parent shipments
    let shipments = await Shipment.find(query).lean();  

    // Get all AWB numbers to fetch child shipments
    const awbNumbers = shipments.map((s) => s.awbNo).filter(Boolean);

    // Fetch child shipments for these parent AWB numbers
    let childShipments = [];
    if (awbNumbers.length > 0) {
      childShipments = await ChildShipment.find({
        $or: [
          { masterAwbNo: { $in: awbNumbers } },
          { MAWB: { $in: awbNumbers } },
        ],
      }).lean();
    }

    // Create a map of parent AWB to child shipments
    const childMap = {};
    childShipments.forEach((child) => {
      const parentKey = child.masterAwbNo || child.MAWB;
      if (parentKey) {
        if (!childMap[parentKey]) {
          childMap[parentKey] = [];
        }
        childMap[parentKey].push(child);
      }
    });

    // Combine parent and child shipments
    let combinedShipments = [];

    shipments.forEach((parent) => {
      // Add parent shipment
      combinedShipments.push({
        ...parent,
        isChild: false,
        parentAwbNo: null,
        childAwbNo: parent.awbNo,
        forwardingNo: parent.shipmentForwardingNo || parent.forwardingNo || "",
        forwarder: parent.shipmentForwarderTo || parent.forwarder || "",
        // Map fields for consistent display
        awbNo: parent.awbNo,
        createdAt: parent.createdAt,
        runNo: parent.runNo,
        sector: parent.sector,
        destination: parent.destination,
        accountCode: parent.accountCode,
        customer: parent.customer,
        receiverFullName: parent.receiverFullName || parent.consigneeName || "",
        service: parent.service,
        upsService: parent.upsService || "",
      });

      // Add child shipments if they exist
      const children = childMap[parent.awbNo] || [];
      children.forEach((child) => {
        combinedShipments.push({
          ...parent, // Include parent data
          isChild: true,
          parentAwbNo: child.masterAwbNo || child.MAWB,
          childAwbNo: child.childAwbNo || "",
          forwardingNo: child.forwardingNo || "",
          forwarder: child.forwarder || "",
          // Override with child-specific data
          awbNo: child.childAwbNo || "", // Show child AWB
          receiverFullName: child.consigneeName || "",
          destination: child.destination || parent.destination,
          // Map other child fields as needed
          _id: child._id,
          createdAt: child.createdAt,
        });
      });
    });

    // If singleForwarding checkbox is checked, show only shipments with forwarding numbers
    if (singleForwarding) {
      combinedShipments = combinedShipments.filter(
        (shipment) =>
          shipment.forwardingNo && shipment.forwardingNo.trim() !== ""
      );
    }

    // Format dates
    combinedShipments = combinedShipments.map((s) => ({
      ...s,
      date: s.date ? formatDateYYYYMMDD(s.date) : null,
      shipmentDate: s.shipmentDate ? formatDateYYYYMMDD(s.shipmentDate) : null,
      createdAt: s.createdAt ? formatDateYYYYMMDD(s.createdAt) : null,
    }));

    return NextResponse.json(combinedShipments, { status: 200 });
  } catch (error) {
    console.error("Error fetching forwarding report:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching forwarding report." },
      { status: 500 }
    );
  }
}
