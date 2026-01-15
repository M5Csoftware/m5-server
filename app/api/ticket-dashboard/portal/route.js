// app/api/ticket-dashboard/portal/route.js

import connectDB from "@/app/lib/db";
import Ticket from "@/app/model/portal/Ticket";

export async function GET(req) {
  await connectDB();

  try {
    const { searchParams } = new URL(req.url);

    // Filters from query params
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");
    const assignedUser = searchParams.get("assignedUser");

    const query = {};

    // Date filtering
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to + "T23:59:59.999Z");
    }

    // Status filtering
    if (status) query.status = status;

    // Assigned user filtering - use assignedTo field in DB
    if (assignedUser) {
      query.assignedTo = new RegExp(`- ${assignedUser}$`, "i");
    }

    // Fetch tickets
    const tickets = await Ticket.find(query).sort({ createdAt: -1 });

    // Map to frontend table format - use assignTo key for both portal and registered
    const mappedTickets = tickets.map((ticket) => ({
      ticketId: ticket.ticketId,
      awbNumber: ticket.awbNumber || "",
      accountCode: ticket.accountCode || "",
      date: ticket.createdAt.toLocaleDateString(),
      time: ticket.createdAt.toLocaleTimeString(),
      category: ticket.category || "",
      subCategory: ticket.subCategory || "",
      sector: ticket.sector || "",
      remarks: ticket.remarks || "",
      status: ticket.status || "",
      lateUpdated: ticket.lateUpdated || "",
      assignTo: ticket.assignedTo || "", // Map portal assignedTo to assignTo
      view: "",
    }));

    return new Response(JSON.stringify(mappedTickets), { status: 200 });
  } catch (err) {
    console.error("Portal Tickets Error:", err);
    return new Response(JSON.stringify({ message: "Server Error" }), {
      status: 500,
    });
  }
}