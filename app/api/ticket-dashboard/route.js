import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";

export async function GET(req) {
  try {
    await connectDB();

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const assignTo = url.searchParams.get("assignTo"); // 👈 new

    const query = {};
    if (status) query.status = status;
    if (from && to) {
      query.date = { $gte: new Date(from), $lte: new Date(to) };
    }
    if (assignTo) {
      query.assignTo = new RegExp(`- ${assignTo}$`, "i");
      // matches strings ending with " - Neha"
    }

    const complaints = await Complaint.find(query)
      .sort({ date: -1 }) // latest first
      .limit(100);

    // Map fields for frontend table
    const mapped = complaints.map((item) => ({
      ticketNo: item.complaintNo || item._id,
      jobId: item.complaintID || "",
      awbNo: item.awbNo || "",
      date: item.date ? new Date(item.date).toLocaleDateString() : "",
      time: item.date ? new Date(item.date).toLocaleTimeString() : "",
      caseType: item.caseType || "",
      remarks: item.remarks || "",
      assignUser: item.assignTo || "",
      status: item.status || "",
      view: `${item.complaintID || item._id}`,
    }));

    return new Response(JSON.stringify(mapped), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
}
