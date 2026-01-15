import connectDB from "@/app/lib/db";
import * as XLSX from "xlsx";
import AssignedSector from "@/app/model/AssignedSector";
import Entity from "@/app/model/Entity";

export async function POST(req) {
  await connectDB();

  try {
    // Read raw file as ArrayBuffer
    const body = await req.arrayBuffer();
    const buffer = Buffer.from(body);

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Excel file is empty" }), {
        status: 400,
      });
    }

    // Fetch valid sectors from DB
    const sectorsFromDB = await Entity.find({ entityType: "Sector" }, "name");
    const validSectors = sectorsFromDB.map((s) =>
      s.name
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase()
    );

    // Helper to clean Excel strings
    const cleanString = (str) =>
      str
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase();

    const errors = [];

    // First pass: validate all rows
    rows.forEach((row, index) => {
      const userId = row.userId?.toString().trim();
      const userName = row.userName?.trim();
      const month = row.month?.trim();
      const rowSectors = row.sectors
        ? row.sectors
            .split(",")
            .map((s) => cleanString(s))
            .filter((s) => s)
        : [];

      if (!userId || !userName || !month || rowSectors.length === 0) {
        errors.push({ row: index + 2, error: "Missing required fields" });
        return;
      }

      const invalid = rowSectors.filter((s) => !validSectors.includes(s));
      if (invalid.length > 0) {
        errors.push({
          row: index + 2,
          error: `Invalid sectors: ${invalid.join(", ")}`,
        });
      }
    });

    // All-or-nothing: fail if any errors
    if (errors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Upload failed due to validation errors",
          failedRows: errors,
        }),
        { status: 400 }
      );
    }

    // Second pass: prepare bulk write
    const updates = rows.map((row) => {
      const userId = row.userId.toString().trim();
      const userName = row.userName.trim();
      const month = row.month.trim();
      const rowSectors = row.sectors
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      const remarks = row.remarks?.trim() || "";

      return {
        updateOne: {
          filter: { userId, month },
          update: { $set: { userName, sectors: rowSectors, remarks } },
          upsert: true,
        },
      };
    });

    await AssignedSector.bulkWrite(updates);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Uploaded ${updates.length} records successfully`,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("Bulk upload failed:", err);
    return new Response(
      JSON.stringify({ error: "Server error during upload" }),
      { status: 500 }
    );
  }
}
