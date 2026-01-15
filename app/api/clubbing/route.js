import { NextResponse } from "next/server";
import Clubbing from "@/app/model/Clubbing";
import Shipment from "@/app/model/portal/Shipment"; // Add this import
import connectDB from "@/app/lib/db";

await connectDB();

export async function GET(req) {
  // Keep your existing GET logic - no changes needed
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const clubNo = searchParams.get("clubNo");
    const runNo = searchParams.get("runNo");
    const all = searchParams.get("all");

    if (!clubNo && !runNo && !all) {
      return NextResponse.json(
        { error: "Either clubNo, runNo or all=true is required" },
        { status: 400 }
      );
    }

    let clubbingData;

    if (all) {
      clubbingData = await Clubbing.find({});
    } else if (clubNo) {
      clubbingData = await Clubbing.findOne({ clubNo });
      if (!clubbingData) {
        return NextResponse.json(
          { message: "No data found for clubNo" },
          { status: 404 }
        );
      }
    } else if (runNo) {
      clubbingData = await Clubbing.find({ runNo });
      if (!clubbingData || clubbingData.length === 0) {
        return NextResponse.json(
          { message: "No data found for runNo" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(clubbingData, { status: 200 });
  } catch (error) {
    console.error("Error fetching clubbing data:", error);
    return NextResponse.json(
      { error: "Failed to fetch clubbing data", details: error.message },
      { status: 500 }
    );
  }
}

// Handle POST request: Create new clubbing data + Update shipments
export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();

    const { runNo, clubNo, date, service, remarks, rowData } = body;

    let parsedDate;
    if (typeof date === "string" && date.includes("/")) {
      const [day, month, year] = date.split("/");
      parsedDate = new Date(`${year}-${month}-${day}`);
    } else {
      parsedDate = new Date(date);
    }

    if (isNaN(parsedDate)) {
      return NextResponse.json(
        { error: "Invalid date format", original: date },
        { status: 400 }
      );
    }

    // Save to DB
    const saved = await Clubbing.create({
      runNo,
      clubNo,
      date: parsedDate,
      service,
      remarks,
      rowData,
    });

    // UPDATE SHIPMENTS WITH clubNo
    if (rowData && Array.isArray(rowData)) {
      const awbNumbers = rowData.map(row => row.awbNo);
      
      await Shipment.updateMany(
        { awbNo: { $in: awbNumbers } },
        { $set: { clubNo: clubNo } }
      );
      
      console.log(`Updated ${awbNumbers.length} shipments with clubNo: ${clubNo}`);
    }

    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    console.error("Error saving clubbing data:", error.message);
    return NextResponse.json(
      {
        error: "Failed to save clubbing data",
        details: error.message,
      },
      { status: 400 }
    );
  }
}

// Handle DELETE request: Delete clubbing data + Clear clubNo from shipments
export async function DELETE(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const clubNo = searchParams.get("clubNo");

    if (!clubNo) {
      return NextResponse.json(
        { error: "clubNo is required for deletion" },
        { status: 400 }
      );
    }

    // Get the club data first to know which AWBs to clear
    const clubToDelete = await Clubbing.findOne({ clubNo });
    
    if (!clubToDelete) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const awbNumbers = clubToDelete.rowData?.map(row => row.awbNo) || [];

    // Delete the club
    const deletedClubbing = await Clubbing.findOneAndDelete({ clubNo });

    // CLEAR clubNo FROM SHIPMENTS
    if (awbNumbers.length > 0) {
      await Shipment.updateMany(
        { awbNo: { $in: awbNumbers } },
        { $set: { clubNo: null } }
      );
      
      console.log(`Cleared clubNo from ${awbNumbers.length} shipments`);
    }

    return NextResponse.json(
      { success: true, data: deletedClubbing },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting clubbing data:", error.message, error.stack);
    return NextResponse.json(
      { error: "Failed to delete clubbing data", details: error.message },
      { status: 400 }
    );
  }
}

// Handle PUT request: Update clubbing data + Sync shipments
export async function PUT(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const clubNo = searchParams.get("clubNo");

    if (!clubNo) {
      return NextResponse.json(
        { error: "clubNo is required for update" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { runNo, date, service, remarks, rowData } = body;

    // Get OLD club data to compare
    const oldClub = await Clubbing.findOne({ clubNo });
    if (!oldClub) {
      return NextResponse.json(
        { error: "Record not found for update" },
        { status: 404 }
      );
    }

    const oldAwbNumbers = oldClub.rowData?.map(row => row.awbNo) || [];
    const newAwbNumbers = rowData?.map(row => row.awbNo) || [];

    let parsedDate;

    // Accept both dd/mm/yyyy and ISO yyyy-mm-dd formats
    if (typeof date === "string") {
      if (date.includes("/")) {
        const [day, month, year] = date.split("/");
        parsedDate = new Date(`${year}-${month}-${day}`);
      } else {
        parsedDate = new Date(date);
      }
    } else {
      parsedDate = new Date(date);
    }

    if (!(parsedDate instanceof Date) || isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format", original: date },
        { status: 400 }
      );
    }

    // Update the club
    const updatedClubbing = await Clubbing.findOneAndUpdate(
      { clubNo },
      {
        runNo,
        clubNo,
        date: parsedDate,
        service,
        remarks,
        rowData,
      },
      { new: true, runValidators: true }
    );

    // SYNC SHIPMENTS
    // 1. Find AWBs removed from this club
    const removedAwbs = oldAwbNumbers.filter(awb => !newAwbNumbers.includes(awb));
    if (removedAwbs.length > 0) {
      await Shipment.updateMany(
        { awbNo: { $in: removedAwbs } },
        { $set: { clubNo: null } }
      );
      console.log(`Removed clubNo from ${removedAwbs.length} shipments`);
    }

    // 2. Find NEW AWBs added to this club
    const addedAwbs = newAwbNumbers.filter(awb => !oldAwbNumbers.includes(awb));
    if (addedAwbs.length > 0) {
      await Shipment.updateMany(
        { awbNo: { $in: addedAwbs } },
        { $set: { clubNo: clubNo } }
      );
      console.log(`Added clubNo to ${addedAwbs.length} shipments`);
    }

    return NextResponse.json(updatedClubbing, { status: 200 });
  } catch (error) {
    console.error("Error updating clubbing data:", error.message);
    return NextResponse.json(
      { error: "Failed to update clubbing data", details: error.message },
      { status: 400 }
    );
  }
}