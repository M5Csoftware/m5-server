import Branch from "@/app/model/Branch";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    // Single branch
    if (code) {
      const branch = await Branch.findOne(
        { code },
        { _id: 0, code: 1 }
      ).lean();

      if (!branch) {
        return NextResponse.json(
          { success: false, error: "Branch not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { success: true, data: branch },
        { status: 200 }
      );
    }

    // All branches (dropdown)
    const branches = await Branch.find(
      {},
      { _id: 0, code: 1 }
    )
      .sort({ code: 1 })
      .lean();

    return NextResponse.json(
      { success: true, data: branches },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch branches" },
      { status: 500 }
    );
  }
}
