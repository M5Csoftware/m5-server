// app/api/portal/csb-setting/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CSBSetting from "@/app/model/portal/CSBSetting";

await connectDB();


export async function POST(req) {
  try {
    const body = await req.json();

    const required = ["name", "kyc", "iec"];
    for (let field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `${field.toUpperCase()} is required` },
          { status: 400 }
        );
      }
    }

    // OPTIONAL: Check duplicates for IEC or KYC
    const exists = await CSBSetting.findOne({
      $or: [{ kyc: body.kyc }, { iec: body.iec }]
    });
    if (exists) {
      return NextResponse.json(
        { error: "A record with this KYC/IEC already exists" },
        { status: 409 }
      );
    }

    const newCsb = await CSBSetting.create(body);
    return NextResponse.json(
      { message: "CSB setting created successfully", data: newCsb },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}


export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");

    let data;

    if (accountCode) {
      data = await CSBSetting.find({ accountCode });
      if (!data) {
        return NextResponse.json(
          { error: "No record found for this account code" },
          { status: 404 }
        );
      }
    } else {
      data = await CSBSetting.find().sort({ createdAt: -1 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}


export async function PUT(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const body = await req.json();

    const updated = await CSBSetting.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return NextResponse.json(
        { error: "CSB setting not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "CSB setting updated successfully", data: updated },
      { status: 200 }
    );
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}


export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const deleted = await CSBSetting.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "CSB setting not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "CSB setting deleted successfully", data: deleted },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
