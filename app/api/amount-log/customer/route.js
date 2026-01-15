import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";

await connectDB();

export async function GET(req) {
  const customers = await CustomerAccount.find(
    {},
    { accountCode: 1, name: 1 }
  ).lean();
  return NextResponse.json(customers);
}
