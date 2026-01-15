import connectDB from "@/app/lib/db";
import RunEntry from "@/app/model/RunEntry";

export async function GET() {
  try {
    await connectDB();

    // Fetch all runs
    const runs = await RunEntry.find({}).sort({ createdAt: -1 });

    // Map required fields
    const formatted = runs.map((run) => ({
      Date: run.date ? new Date(run.date).toISOString().split("T")[0] : "-",
      RunNumber: run.runNo || "-",
      Sector: run.sector || "-",
      Status: run.flightnumber ? "Delivered" : "Pending", // temp example rule
    }));

    return new Response(JSON.stringify(formatted), { status: 200 });
  } catch (error) {
    console.error("Run summary error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch run summary" }),
      { status: 500 }
    );
  }
}
