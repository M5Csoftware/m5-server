import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/db';
import Ticket from '@/app/model/portal/Ticket';
import Shipment from '@/app/model/portal/Shipment';

export async function GET() {
  try {
    await connectDB();
    const tickets = await Ticket.find({});
    return NextResponse.json({ success: true, data: tickets }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();

    const { awbNumber, accountCode } = body;

    // 1. Validate AWB exists in shipment
    const shipment = await Shipment.findOne({ awbNo: awbNumber });
    if (!shipment) {
      return NextResponse.json(
        { success: false, error: "AWB Number does not exist" },
        { status: 400 }
      );
    }

    // 2. Validate account code matches
    if (shipment.accountCode !== accountCode) {
      return NextResponse.json(
        { success: false, error: "Account code does not match for this AWB" },
        { status: 403 }
      );
    }

    // 3. Generate ticketId in format: <accountCode>-TR-<increment number>
    const lastTicket = await Ticket.findOne({ accountCode })
      .sort({ createdAt: -1 });

    let nextNumber = 1;
    if (lastTicket?.ticketId) {
      const parts = lastTicket.ticketId.split("-");
      const lastNum = parseInt(parts[parts.length - 1], 10);
      nextNumber = lastNum + 1;
    }

    const ticketId = `${accountCode}-TR-${String(nextNumber).padStart(3, "0")}`;

    // 4. Pull sector from shipment
    const sector = shipment.sector || null;

    // 5. Create ticket with sector stored
    const ticket = await Ticket.create({
      ...body,
      ticketId,
      sector,   // ✅ storing sector
      status: "open",
    });

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { awbNumber } = body;

    if (!awbNumber) {
      return NextResponse.json(
        { success: false, error: "AWB Number is required" },
        { status: 400 }
      );
    }

    const deletedTicket = await Ticket.findOneAndDelete({ awbNumber });

    if (!deletedTicket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Ticket deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


export async function PUT(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { awbNumber, updates } = body;

    console.log(updates);

    if (!awbNumber) {
      return NextResponse.json(
        { success: false, error: "AWB Number is required" },
        { status: 400 }
      );
    }

    const ticket = await Ticket.findOneAndUpdate(
      { awbNumber },
      {
        $set: {
          ...updates,
          resolutionDate: updates.isResolved ? new Date() : null
        }
      },
      { new: true }
    );

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found for this AWB" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: ticket }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
