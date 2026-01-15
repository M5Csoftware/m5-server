import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req) {
    try {
        const { to, awbNo, hub, trackingUrl } = await req.json();

        if (!to || !awbNo || !hub || !trackingUrl) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        const client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );

        const messageBody = `Your shipment with AWB No. ${awbNo} has been received at ${hub} Hub. Track it here: ${trackingUrl}`;

        const response = await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: `whatsapp:${to}`,
            body: messageBody,
        });

        return NextResponse.json({ success: true, sid: response.sid });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
