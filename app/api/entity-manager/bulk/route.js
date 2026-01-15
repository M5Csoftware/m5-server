import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Entity from "@/app/model/Entity";

export async function POST(req) {
  try {
    await connectDB(); // ✅ Ensure DB connection before anything else

    const payload = await req.json();
    console.log("🔹 Bulk Upload Payload:", payload);

    if (!Array.isArray(payload)) {
      return NextResponse.json(
        { error: "Payload must be an array" },
        { status: 400 }
      );
    }

    const allowedFields = [
      "code",
      "name",
      "entityType",
      "sector",
      "activateOnPortal",
      "activateOnSoftware",
      "hsn",
      "taxCharges",
      "fuelCharges",
    ];

    // ✅ Filter + sanitize incoming data
    const filteredPayload = payload
      .filter((item) => item.code && item.name && item.entityType)
      .map((entry) => {
        const cleanEntry = {};
        allowedFields.forEach((field) => {
          if (entry.hasOwnProperty(field)) {
            cleanEntry[field] = entry[field];
          }
        });
        return cleanEntry;
      });

    if (filteredPayload.length === 0) {
      return NextResponse.json(
        { error: "No valid records to insert" },
        { status: 400 }
      );
    }

    // ✅ Check existing codes in DB to avoid duplicates
    const existingEntities = await Entity.find({
      code: { $in: filteredPayload.map((e) => e.code) },
    }).select("code");

    const existingCodes = new Set(existingEntities.map((e) => e.code));

    // ✅ Keep only new unique entities
    const newEntities = filteredPayload.filter(
      (e) => !existingCodes.has(e.code)
    );

    if (newEntities.length === 0) {
      return NextResponse.json(
        { message: "All records already exist, nothing inserted" },
        { status: 200 }
      );
    }

    const result = await Entity.insertMany(newEntities);
    return NextResponse.json(
      {
        message: "Entities inserted",
        insertedCount: result.length,
        skippedCount: filteredPayload.length - result.length,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("🔥 Bulk upload server error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType");

    if (!entityType) {
      return NextResponse.json(
        { error: "entityType is required" },
        { status: 400 }
      );
    }

    const entities = await Entity.find({ entityType }).select("code name");

    return NextResponse.json(entities, { status: 200 });
  } catch (err) {
    console.error("GET /entity-manager error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
