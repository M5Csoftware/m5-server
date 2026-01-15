import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Manifest from "@/app/model/portal/Manifest";

// Ensure DB is connected before handling requests
await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const manifestNumber = searchParams.get("manifestNumber");
    const accountCode = searchParams.get("accountCode");

    let query = {};

    // ✅ Priority: manifestNumber > accountCode > all
    if (manifestNumber) {
      query = { manifestNumber };
    } else if (accountCode) {
      query = { accountCode };
    }

    // Fetch manifests based on query
    const manifests = await Manifest.find(query);

    if (!manifests || manifests.length === 0) {
      return NextResponse.json(
        { error: "No manifests found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        manifests,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching manifests:", error);
    return NextResponse.json(
      { error: "Failed to fetch manifests", details: error.message },
      { status: 500 }
    );
  }
}
