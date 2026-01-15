import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";
import Ticket from "@/app/model/portal/Ticket";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();

    console.log("Fetching complaint & ticket summary for dashboard...");

    // 🔹 Tickets (Portal)
    const ticketOpenCount = await Ticket.countDocuments({
      $or: [{ status: "Open" }, { isResolved: false }],
    });

    const ticketResolvedCount = await Ticket.countDocuments({
      $or: [{ status: "Close" }, { isResolved: true }],
    });

    // 🔹 Complaints (Manual)
    const complaintOpenCount = await Complaint.countDocuments({
      $or: [{ status: "Open" }, { isResolved: false }],
    });

    const complaintResolvedCount = await Complaint.countDocuments({
      $or: [{ status: "Close" }, { isResolved: true }],
    });

    // 🔹 Combine totals
    const result = {
      portalTickets: {
        open: ticketOpenCount,
        resolved: ticketResolvedCount,
      },
      manualTickets: {
        open: complaintOpenCount,
        resolved: complaintResolvedCount,
      },
      totals: {
        open: ticketOpenCount + complaintOpenCount,
        resolved: ticketResolvedCount + complaintResolvedCount,
      },
    };

    console.log("Complaint summary result:", result);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error fetching complaint summary:", error);

    return NextResponse.json(
      {
        message: "Error fetching complaint summary",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
