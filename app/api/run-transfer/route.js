// app/api/run-transfer/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RunTransfer from "@/app/model/RunTransfer";

// Connect to MongoDB
await connectDB();

// GET: fetch run transfer(s)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    let query = {};
    if (runNo) {
      query.runNo = { $regex: new RegExp(`^${runNo}$`, "i") }; // case-insensitive
    }

    const runTransfers = await RunTransfer.find(query).lean();
    return NextResponse.json(runTransfers, { status: 200 });
  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// POST: create new run transfer
export async function POST(req) {
  try {
    const data = await req.json();

    if (
      !data.runNo ||
      !Array.isArray(data.airwayBill) ||
      data.airwayBill.length === 0
    ) {
      return NextResponse.json(
        { error: "runNo and airwayBill array are required" },
        { status: 400 }
      );
    }

    // Check if runNo already exists
    const existingRun = await RunTransfer.findOne({ runNo: data.runNo });
    if (existingRun) {
      return NextResponse.json(
        { error: `Run number ${data.runNo} already exists.` },
        { status: 400 }
      );
    }

    // Convert dates inside airwayBill
    const airwayBill = data.airwayBill.map((awb) => ({
      ...awb,
      ExportDate: awb.ExportDate ? new Date(awb.ExportDate) : undefined,
      GSTDate: awb.GSTDate ? new Date(awb.GSTDate) : undefined,
    }));

    const newRunTransfer = new RunTransfer({
      runNo: data.runNo,
      runEntry: data.runEntry || {},
      airwayBill,
    });

    const savedRun = await newRunTransfer.save();
    return NextResponse.json(savedRun, { status: 201 });
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// PUT: update run transfer by runNo or update specific AWB
export async function PUT(req) {
  try {
    const data = await req.json();

    // Validation
    if (!data.awbNumber && !data.hawbNumber) {
      return NextResponse.json(
        { error: "awbNumber or hawbNumber is required" },
        { status: 400 }
      );
    }

    if (!data.country) {
      return NextResponse.json(
        { error: "country is required" },
        { status: 400 }
      );
    }

    // Pick number (AWB or HAWB)
    const number = data.awbNumber || data.hawbNumber;

    // 🔑 Update all documents + all matching array elements
    const updatedRun = await RunTransfer.updateMany(
      { "airwayBill.HAWBNumber": number },
      {
        $set: {
          "airwayBill.$[elem].ConsigneeCountry": data.country,
        },
      },
      {
        arrayFilters: [{ "elem.HAWBNumber": number }],
      }
    );

    if (!updatedRun.modifiedCount) {
      return NextResponse.json(
        { error: `No airwayBill found for number ${number}` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "ConsigneeCountry updated successfully", result: updatedRun },
      { status: 200 }
    );
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: delete run transfer by runNo
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return NextResponse.json({ error: "runNo is required" }, { status: 400 });
    }

    const deletedRun = await RunTransfer.findOneAndDelete({ runNo });
    if (!deletedRun) {
      return NextResponse.json(
        { error: "RunTransfer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "RunTransfer deleted successfully", deletedRun },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
