import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Notification from "@/app/model/Notification";

export async function POST(req) {
  await connectDB();

  try {
    const body = await req.json();

    if (!body.accountCode || !body.event) {
      return Response.json(
        { error: "accountCode and event are required" },
        { status: 400 },
      );
    }

    // 1️⃣ Find customer
    const customer = await CustomerAccount.findOne({
      accountCode: body.accountCode,
    });

    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    const prefs = customer.notificationPreferences || {};

    // 2️⃣ Convert event → preference key
    // Example: "Shipment Hold" → shipmentHold_portal
    const key =
      body.event.replace(/\s+/g, "").charAt(0).toLowerCase() +
      body.event.replace(/\s+/g, "").slice(1);

    const portalKey = `${key}_portal`;

    // 3️⃣ If portal disabled → stop
    if (!prefs[portalKey]) {
      return Response.json(
        { message: "Portal notification disabled for this event" },
        { status: 200 },
      );
    }

    // 4️⃣ Create notification
    const notification = await Notification.create(body);

    return Response.json(notification);
  } catch (error) {
    console.error("Notification create error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
