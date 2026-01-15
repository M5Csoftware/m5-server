import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";

// GET — fetch complaint details by complaintNo
export async function GET(req) {
  try {
    await connectDB();

    const url = new URL(req.url);
    const complaintNo = url.searchParams.get("complaintNo");

    if (!complaintNo) {
      return new Response(
        JSON.stringify({ error: "complaintNo is required" }),
        { status: 400 }
      );
    }

    const complaint = await Complaint.findOne({ complaintNo }).lean();

    if (!complaint) {
      return new Response(JSON.stringify({ error: "Complaint not found" }), {
        status: 404,
      });
    }

    return new Response(JSON.stringify(complaint), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
}

// PUT — update complaint, save current remarks, and add history
export async function PUT(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { complaintNo, status, assignTo, action, actionUser, remarks } = body;

    if (!complaintNo) {
      return new Response(
        JSON.stringify({ error: "complaintNo is required" }),
        { status: 400 }
      );
    }

    const complaint = await Complaint.findOne({ complaintNo });
    if (!complaint) {
      return new Response(JSON.stringify({ error: "Complaint not found" }), {
        status: 404,
      });
    }

    // Update complaint fields
    if (status) {
      complaint.status = status;
      complaint.isResolved = status === "Close"; // ✅ set isResolved automatically
    }
    if (assignTo) complaint.assignTo = assignTo;
    if (remarks !== undefined) complaint.remarks = remarks; // ✅ save current remarks

    // Add entry to history
    complaint.history.push({
      action: action || "Updated complaint",
      actionUser: actionUser || "System",
      statusHistory: status || complaint.status,
      assignTo: assignTo || complaint.assignTo,
      date: new Date(),
    });

    await complaint.save();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Complaint updated successfully",
      }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
}
