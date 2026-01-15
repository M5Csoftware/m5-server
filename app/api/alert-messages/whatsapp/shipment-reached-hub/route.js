import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const { to, awbNo, hub, trackingUrl } = await req.json();

        if (!to || !awbNo || !hub || !trackingUrl) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        const messageBody = `Your shipment with AWB No. ${awbNo} has been received at ${hub} Hub. Track it here: ${trackingUrl}`;

        const gupshupUrl = "https://api.gupshup.io/sm/api/v1/msg";
        const apiKey = process.env.GUPSHUP_API_KEY; // Store API Key in env file

        const response = await fetch(gupshupUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "apikey": apiKey,
            },
            body: new URLSearchParams({
                channel: "whatsapp",
                source: process.env.GUPSHUP_WHATSAPP_NUMBER, // Your registered Gupshup number
                destination: to, // Customer's WhatsApp number
                message: messageBody,
            }),
        });

        const result = await response.json();

        if (result.status === "success") {
            return NextResponse.json({ success: true, messageId: result.messageId });
        } else {
            return NextResponse.json({ error: result.message }, { status: 500 });
        }
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
