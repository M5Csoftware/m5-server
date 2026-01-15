import connectDB from "@/app/lib/db";
import Ticket from "@/app/model/portal/Ticket";

// ─── GET ───────────────────────────────
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ticketId = searchParams.get("ticketId");

  if (!ticketId) {
    return new Response(JSON.stringify({ message: "ticketId is required" }), {
      status: 400,
    });
  }

  try {
    await connectDB();
    const ticket = await Ticket.findOne({ ticketId });

    if (!ticket) {
      return new Response(JSON.stringify({ message: "Ticket not found" }), {
        status: 404,
      });
    }

    return new Response(JSON.stringify({ ticket }), { status: 200 });
  } catch (err) {
    return new Response(
      JSON.stringify({ message: "Server error", error: err.message }),
      { status: 500 }
    );
  }
}

// ─── PUT ───────────────────────────────
export async function PUT(req) {
  try {
    await connectDB();
    const {
      ticketId,
      remarks,
      status,
      priorityStatus,
      assignedTo,
      updatedBy,
      resolve,
    } = await req.json();

    if (!ticketId) {
      return new Response(JSON.stringify({ message: "ticketId is required" }), {
        status: 400,
      });
    }

    const ticket = await Ticket.findOne({ ticketId });
    if (!ticket) {
      return new Response(JSON.stringify({ message: "Ticket not found" }), {
        status: 404,
      });
    }

    const newStatus = resolve ? "Resolved" : status || ticket.status;
    const newPriorityStatus = priorityStatus || ticket.priorityStatus;
    const newAssignedTo = assignedTo || ticket.assignedTo;
    const newRemarks = remarks || "Ticket Updated";

    const updatedTicket = await Ticket.findOneAndUpdate(
      { ticketId },
      {
        $set: {
          remarks: newRemarks,
          status: newStatus,
          priorityStatus: newPriorityStatus,
          assignedTo: newAssignedTo,
          isResolved: resolve === true,
          resolutionDate: resolve === true ? new Date() : ticket.resolutionDate,
        },
        $push: {
          history: {
            action: newRemarks,
            date: new Date(),
            actionUser: updatedBy || "Portal User",
            statusHistory: newStatus,
            assignedTo: newAssignedTo,
          },
        },
      },
      { new: true }
    );

    return new Response(
      JSON.stringify({ success: true, ticket: updatedTicket }),
      { status: 200 }
    );
  } catch (err) {
    console.error("Update error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Server error",
        error: err.message,
      }),
      { status: 500 }
    );
  }
}
