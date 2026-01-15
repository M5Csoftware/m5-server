import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";
import Shipment from "@/app/model/portal/Shipment";

// Helper function to parse DD/MM/YYYY format to Date object
const parseDDMMYYYY = (dateString) => {
  if (!dateString) return new Date();

  // If it's already a valid Date object or ISO string
  const testDate = new Date(dateString);
  if (!isNaN(testDate.getTime()) && typeof dateString !== "string") {
    return testDate;
  }

  // If it's a string in DD/MM/YYYY format
  if (typeof dateString === "string" && dateString.includes("/")) {
    const parts = dateString.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }

  // Try parsing as ISO string or timestamp
  const parsed = new Date(dateString);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Default to current date if parsing fails
  return new Date();
};

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();

    // Required field validation
    if (
      !body.awbNo ||
      !body.complaintType ||
      !body.complaintSource ||
      !body.caseType ||
      !body.assignTo ||
      !body.actionUser ||
      !body.complaintRemark
    ) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate unique complaintID
    const generateComplaintId = () => {
      const timestamp = Date.now().toString();
      const randomNum = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
      return `C${timestamp}${randomNum}`;
    };
    const complaintID = generateComplaintId();

    // Generate sequential complaintNo
    const generateComplaintNo = async () => {
      const lastComplaint = await Complaint.findOne({
        complaintNo: { $ne: null },
      }).sort({ createdAt: -1 });
      let complaintNo = "CMP0001";

      if (lastComplaint?.complaintNo) {
        const prevNum = parseInt(
          lastComplaint.complaintNo.replace("CMP", ""),
          10
        );
        complaintNo = `CMP${(prevNum + 1).toString().padStart(4, "0")}`;
      }

      return complaintNo;
    };
    const complaintNo = await generateComplaintNo();

    // Parse the date from DD/MM/YYYY format
    const parsedDate = parseDDMMYYYY(body.date);

    // History entry for creation
    const now = new Date();
    const historyEntry = {
      action: body.complaintRemark,
      date: now,
      actionUser: body.actionUser,
    };

    // Create complaint
    const newComplaint = await Complaint.create({
      awbNo: body.awbNo,
      complaintNo,
      complaintID,
      date: parsedDate, // Use parsed date
      complaintType: body.complaintType,
      complaintSource: body.complaintSource,
      caseType: body.caseType,
      assignTo: body.assignTo,
      status: "Open",
      complaintRemark: body.complaintRemark,
      history: [historyEntry],
    });

    // Fetch operationRemark from shipment
    const shipment = await Shipment.findOne(
      { awbNo: body.awbNo },
      { operationRemark: 1, _id: 0 }
    );

    // Convert to plain object & append operationRemark
    const complaintObj = newComplaint.toObject();
    complaintObj.operationRemark = shipment?.operationRemark || null;

    return NextResponse.json(
      { success: true, complaint: complaintObj },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error submitting complaint:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    await connectDB();

    // Fetch all complaints
    const complaints = await Complaint.find();

    return NextResponse.json({ success: true, complaints }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { awbNo, complaintRemark, actionUser } = body;

    if (!awbNo || !complaintRemark || !actionUser) {
      return NextResponse.json(
        {
          success: false,
          message: "awbNo, complaintRemark, and actionUser are required",
        },
        { status: 400 }
      );
    }

    // Build history entry
    const now = new Date();
    const historyEntry = {
      action: complaintRemark,
      date: now,
      actionUser,
    };

    // Update complaint: set remark + push to history
    const complaint = await Complaint.findOneAndUpdate(
      { awbNo },
      {
        $set: { complaintRemark },
        $push: { history: historyEntry },
      },
      { new: true }
    );

    if (!complaint) {
      return NextResponse.json(
        { success: false, message: "Complaint not found" },
        { status: 404 }
      );
    }

    // Fetch operationRemark from Shipment collection
    const shipment = await Shipment.findOne(
      { awbNo },
      { operationRemark: 1, _id: 0 }
    );

    // Append operationRemark into complaint object
    const complaintObj = complaint.toObject();
    complaintObj.operationRemark = shipment?.operationRemark || null;

    return NextResponse.json(
      { success: true, complaint: complaintObj },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating complaint:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
