import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // Check if this is a dropdown request
    if (searchParams.get("dropdowns") === "true") {
      const uniqueCompanies = await Shipment.distinct("company");
      const uniqueRefPersons = await Shipment.distinct("reference");

      return NextResponse.json({
        dropdowns: {
          companies: uniqueCompanies.sort(),
          refPersons: uniqueRefPersons.sort(),
        },
      });
    }

    // Required dates
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Please provide from and to dates", data: [] },
        { status: 400 }
      );
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate) || isNaN(toDate)) {
      return NextResponse.json(
        { error: "Invalid date format", data: [] },
        { status: 400 }
      );
    }

    // Base filters
    const filters = {
      date: { $gte: fromDate, $lte: toDate },
    };

    // Optional filters
    if (searchParams.get("runNo")) filters.runNo = searchParams.get("runNo");
    if (searchParams.get("payment"))
      filters.payment = searchParams.get("payment");
    if (searchParams.get("branch"))
      filters.company = searchParams.get("branch");
    if (searchParams.get("origin")) filters.origin = searchParams.get("origin");
    if (searchParams.get("sector")) filters.sector = searchParams.get("sector");
    if (searchParams.get("destination"))
      filters.destination = searchParams.get("destination");
    if (searchParams.get("network"))
      filters.network = searchParams.get("network");
    if (searchParams.get("counterPart"))
      filters.counterPart = searchParams.get("counterPart");
    if (searchParams.get("saleRefPerson"))
      filters.reference = searchParams.get("saleRefPerson");
    if (searchParams.get("company"))
      filters.company = searchParams.get("company");
    if (searchParams.get("accountCode")) {
      filters.accountCode = {
        $regex: `^${searchParams.get("accountCode")}$`, // exact match
        $options: "i",
      };
    }
    if (searchParams.get("state"))
      filters.receiverState = searchParams.get("state");
    if (searchParams.get("withBooking") === "1") filters.date = { $ne: null };

    const salePerson = searchParams.get("salePerson");

    // Aggregation for enrichment
    const shipments = await Shipment.aggregate([
      { $match: filters },
      {
        $lookup: {
          from: "customeraccounts",
          localField: "accountCode",
          foreignField: "accountCode",
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
      ...(salePerson
        ? [{ $match: { "customer.salesPersonName": salePerson } }]
        : []),
      { $sort: { date: 1 } },
      {
        $project: {
          awbNo: 1,
          date: 1,
          flight: 1,
          runNo: 1,
          clubNo: 1,
          company: 1,
          insertUser: 1,
          reference: 1,
          network: 1,
          origin: 1,
          sector: 1,
          destination: 1,
          accountCode: 1,
          customerName: "$customer.name",
          salesPersonName: "$customer.salesPersonName",
          referenceBy: "$customer.referenceBy",
          receiverFullName: 1,
          receiverAddressLine1: 1,
          receiverCity: 1,
          receiverState: 1,
          receiverPincode: 1,
          receiverPhoneNumber: 1,
          service: 1,
          pcs: 1,
          goodstype: 1,
          totalActualWt: 1,
          totalVolWt: 1,
          volDisc: 1,
          chgwt: 1,
          payment: 1,
          basicAmt: 1,
          sgst: 1,
          cgst: 1,
          igst: 1,
          miscChg: 1,
          miscChgReason: 1,
          fuelAmt: 1,
          totalAmt: 1,
          currency: 1,
          billNo: 1,
          AwbCheck: 1,
          operationRemark: 1,
        },
      },
    ]);

    return NextResponse.json({ data: shipments || [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message, data: [] }, { status: 500 });
  }
}
