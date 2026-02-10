import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import APIRequest from "@/app/model/portal/APIRequest";

await connectDB();

// -----------------------------
// CREATE
// -----------------------------
export async function POST(req) {
  try {
    const body = await req.json();

    const required = [
      "customerCode",
      "customerName",
      "email",
      "phone",
      "apiUseCase",
    ];

    for (let field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 },
        );
      }
    }

    // Check if apiUseCase is an array and has at least one item
    if (Array.isArray(body.apiUseCase) && body.apiUseCase.length === 0) {
      return NextResponse.json(
        { error: "Please select at least one API use case" },
        { status: 400 },
      );
    }

    // Duplicate customerCode or email
    const exists = await APIRequest.findOne({
      $or: [{ customerCode: body.customerCode }, { email: body.email }],
    });

    if (exists) {
      return NextResponse.json(
        { error: "CustomerCode or Email already exists" },
        { status: 409 },
      );
    }

    // Debug: Log what we're about to save
    console.log("Saving API Request with apiUseCase:", body.apiUseCase);
    console.log("apiUseCase type:", typeof body.apiUseCase);
    console.log("apiUseCase isArray:", Array.isArray(body.apiUseCase));

    // With Mixed type schema, array is stored directly
    const created = await APIRequest.create(body);

    // Debug: Log what was saved
    console.log("Saved apiUseCase:", created.apiUseCase);

    return NextResponse.json(
      { message: "API request created successfully", data: created },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// -----------------------------
// READ
// -----------------------------
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const customerCode = searchParams.get("customerCode");

    let data;

    if (customerCode) {
      // Use .lean() to get plain JavaScript objects instead of Mongoose documents
      data = await APIRequest.findOne({ customerCode }).lean();

      if (!data) {
        return NextResponse.json(
          { error: "No data found for this customerCode" },
          { status: 404 },
        );
      }

      // Convert _id to string and add id field
      data = {
        ...data,
        _id: data._id.toString(),
        id: data._id.toString(),
      };

      console.log("GET Single - apiUseCase:", data.apiUseCase, "Type:", typeof data.apiUseCase);
    } else {
      // Use .lean() to get plain JavaScript objects
      data = await APIRequest.find().sort({ createdAt: -1 }).lean();

      // Convert _id to string and add id field for each item
      data = data.map(item => {
        const transformed = {
          ...item,
          _id: item._id.toString(),
          id: item._id.toString(),
        };
        console.log("GET List - User:", item.customerName, "apiUseCase:", item.apiUseCase, "Type:", typeof item.apiUseCase, "IsArray:", Array.isArray(item.apiUseCase));
        return transformed;
      });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// -----------------------------
// UPDATE
// -----------------------------
export async function PUT(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const body = await req.json();

    const updated = await APIRequest.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "API request updated successfully", data: updated },
      { status: 200 },
    );
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// -----------------------------
// DELETE
// -----------------------------
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const deleted = await APIRequest.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "API request deleted successfully", data: deleted },
      { status: 200 },
    );
  } catch (error) {
    console.error("DELETE Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}