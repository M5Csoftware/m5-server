import connectDB from "@/app/lib/db";
import PaymentEntry from "@/app/model/PaymentEntry";

export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const customerCode = searchParams.get("customerCode");

  if (!customerCode) {
    return new Response(
      JSON.stringify({ error: "customerCode query parameter is required" }),
      { status: 400 }
    );
  }

  try {
    // Fetch all payments for the given customerCode, most recent first
    const entries = await PaymentEntry.find({ customerCode }).sort({ date: -1 });

    return new Response(JSON.stringify(entries), { status: 200 });
  } catch (err) {
    console.error("Error fetching customer payments:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: err.message }),
      { status: 500 }
    );
  }
}
