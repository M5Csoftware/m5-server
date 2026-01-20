import connectDB from "@/app/lib/db";
import Zone from "@/app/model/Zone";

export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const zoneTariff = searchParams.get("zoneTariff");

  console.log("Zone List API - Received zoneTariff:", zoneTariff);

  if (!zoneTariff || !zoneTariff.trim()) {
    console.log("No zone tariff provided");
    return NextResponse.json([], { status: 200 });
