import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/db';
import Ticket from '@/app/model/portal/Ticket';

export async function GET(req) {
    try {
        await connectDB();

        // get query params from request
        const { searchParams } = new URL(req.url);
        const accountCode = searchParams.get("accountCode");

        // conditionally filter
        const query = accountCode ? { accountCode } : {};
        const tickets = await Ticket.find(query);

        return NextResponse.json({ success: true, data: tickets }, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
