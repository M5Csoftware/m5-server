import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Run from "@/app/model/RunEntry";

// Connect to MongoDB
await connectDB();


export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return NextResponse.json(
        { error: "runNo query parameter is required" },
        { status: 400 }
      );
    }

    // Case-insensitive search for the given runNo
    const runData = await Run.findOne({
  runNo: { $regex: new RegExp(`^${runNo}$`, "i") },
});


    if (!runData) {
      return NextResponse.json(
        { error: `Run with runNo "${runNo}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(runData, { status: 200 });
  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// POST: create new run entry
export async function POST(req) {
  try {
    const data = await req.json();

    const requiredFields = ["accountType", "runNo"];
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    // Check if run number already exists for this account type
    const existingRun = await Run.findOne({
      accountType: data.accountType,
      runNo: { $regex: new RegExp(`^${data.runNo}$`, "i") },
    });

    if (existingRun) {
      return NextResponse.json(
        {
          error: `Run number ${data.runNo} already exists for ${data.accountType}. Please use a different run number.`,
        },
        { status: 400 }
      );
    }

    // Helper function to validate a Date object
    const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

    let finalDate;
    if (data.date) {
      // Convert "17/07/2025" to "2025-07-17"
      const parts = data.date.split("/");
      const formattedDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      const tempDate = new Date(formattedDateStr);

      finalDate = isValidDate(tempDate) ? tempDate : undefined;
    }

    const newRun = new Run({
      accountType: data.accountType,
      almawb: data.almawb,
      counterpart: data.counterpart,
      cdNumber: data.cdNumber,
      date: finalDate,
      destination: data.destination || null,
      // destination1: data.destination1 || null,
      flight: data.flight,
      flightnumber: data.flightnumber,
      hub: data.hub,
      obc: data.obc,
      origin: data.origin || null,
      runNo: data.runNo,
      sector: data.sector,
      transportType: data.transportType || null,
      uniqueID: data.uniqueID,
    });

    const savedRun = await newRun.save();
    return NextResponse.json(savedRun, { status: 201 });
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// PUT: update run entry using accountType and runNo
export async function PUT(req) {
  try {
    const data = await req.json();

    if (!data.accountType || !data.runNo) {
      return NextResponse.json(
        { error: "accountType and runNo are required" },
        { status: 400 }
      );
    }

    // Find entry by accountType and runNo
    const existingRun = await Run.findOne({
      accountType: data.accountType,
      runNo: { $regex: new RegExp(`^${data.runNo}$`, "i") },
    });

    if (!existingRun) {
      return NextResponse.json(
        { error: "Run entry not found for given accountType and runNo" },
        { status: 404 }
      );
    }

    // Helper function to parse date
    const parseDate = (dateStr) => {
      if (!dateStr) return undefined;
      const jsDate = new Date(dateStr);
      return !isNaN(jsDate.getTime()) ? jsDate : undefined;
    };

    if (data.date) {
      const parsedDate = parseDate(data.date);
      if (parsedDate) {
        data.date = parsedDate;
      } else {
        return NextResponse.json(
          { error: "Invalid date format" },
          { status: 400 }
        );
      }
    }

    // Update
    Object.assign(existingRun, data);
    const updatedRun = await existingRun.save();

    return NextResponse.json(updatedRun, { status: 200 });
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: delete run entry using accountType and runNo
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const deletedRun = await Run.findByIdAndDelete(id);

    if (!deletedRun) {
      return NextResponse.json(
        { error: "Run entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Run entry deleted successfully", deletedRun },
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