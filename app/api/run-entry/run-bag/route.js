import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Run from "@/app/model/RunEntry";

// Connect to MongoDB
await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");
    const accountType = searchParams.get("accountType");

    if (!runNo) {
      return NextResponse.json(
        { error: "runNo query parameter is required" },
        { status: 400 }
      );
    }

    if (!accountType) {
      return NextResponse.json(
        { error: "accountType query parameter is required" },
        { status: 400 }
      );
    }

    // Strict search - both runNo and accountType must match exactly
    const query = {
      runNo: { $regex: new RegExp(`^${runNo}$`, "i") },
      accountType: accountType
    };

    console.log("GET Query:", query);

    const runData = await Run.findOne(query);

    if (!runData) {
      return NextResponse.json(
        { error: `Run with runNo "${runNo}" and accountType "${accountType}" not found` },
        { status: 404 }
      );
    }

    // Convert the MongoDB document to a plain object and handle date properly
    const responseData = runData.toObject();
    
    // Ensure date is properly formatted as ISO string if it exists
    if (responseData.date) {
      responseData.date = responseData.date.toISOString();
      console.log("Sending date as ISO string:", responseData.date);
    }

    console.log("Sending response data:", responseData);

    return NextResponse.json(responseData, { status: 200 });
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
      console.log("Received date data:", data.date, "Type:", typeof data.date);
      
      // Handle different date formats
      let tempDate;
      
      // Check if it's already in ISO format (YYYY-MM-DD)
      if (typeof data.date === 'string') {
        if (data.date.includes('-') && data.date.length === 10) {
          // YYYY-MM-DD format
          tempDate = new Date(data.date + 'T00:00:00.000Z');
        } else if (data.date.includes('/')) {
          // Convert "17/07/2025" to "2025-07-17"
          const parts = data.date.split("/");
          if (parts.length === 3) {
            const formattedDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            tempDate = new Date(formattedDateStr + 'T00:00:00.000Z');
          }
        } else {
          tempDate = new Date(data.date);
        }
      } else {
        tempDate = new Date(data.date);
      }

      finalDate = isValidDate(tempDate) ? tempDate : undefined;
      console.log("Final processed date:", finalDate);
    }

    const newRun = new Run({
      accountType: data.accountType,
      almawb: data.almawb,
      counterpart: data.counterpart,
      cdNumber: data.cdNumber,
      date: finalDate,
      destination: data.destination || null,
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
    
    // Convert to object and format date for response
    const responseData = savedRun.toObject();
    if (responseData.date) {
      responseData.date = responseData.date.toISOString();
    }
    
    return NextResponse.json(responseData, { status: 201 });
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
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const data = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (!data.accountType || !data.runNo) {
      return NextResponse.json(
        { error: "accountType and runNo are required" },
        { status: 400 }
      );
    }

    // Find entry by ID first
    const existingRun = await Run.findById(id);

    if (!existingRun) {
      return NextResponse.json(
        { error: "Run entry not found" },
        { status: 404 }
      );
    }

    // Helper function to parse date
    const parseDate = (dateStr) => {
      if (!dateStr) return undefined;
      
      console.log("Parsing date:", dateStr, "Type:", typeof dateStr);
      
      let jsDate;
      
      if (typeof dateStr === 'string') {
        // Check if it's already in ISO format (YYYY-MM-DD)
        if (dateStr.includes('-') && dateStr.length === 10) {
          jsDate = new Date(dateStr + 'T00:00:00.000Z');
        } else if (dateStr.includes('/')) {
          // Convert "17/07/2025" to "2025-07-17"
          const parts = dateStr.split("/");
          if (parts.length === 3) {
            const formattedDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            jsDate = new Date(formattedDateStr + 'T00:00:00.000Z');
          }
        } else {
          jsDate = new Date(dateStr);
        }
      } else {
        jsDate = new Date(dateStr);
      }
      
      console.log("Parsed date result:", jsDate);
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

    // Convert to object and format date for response
    const responseData = updatedRun.toObject();
    if (responseData.date) {
      responseData.date = responseData.date.toISOString();
    }

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: delete run entry using ID
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