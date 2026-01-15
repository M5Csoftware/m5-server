import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ExpenseEntry from "@/app/model/ExpenseEntry";

// Ensure DB connection
connectDB();

export async function POST(req) {
  try {
    const body = await req.json();
    const { date, expenseType, amount, description, receiptAmount = 0 } = body;

    if (!date || !expenseType || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get all existing entries to calculate total
    const allExpenses = await ExpenseEntry.find({});

    const totalExpense = allExpenses.reduce(
      (sum, item) =>
        sum + (item.expenseType !== "Receipt" ? item.amount || 0 : 0),
      0
    );
    const totalReceipt = allExpenses.reduce(
      (sum, item) =>
        sum + (item.expenseType === "Receipt" ? item.amount || 0 : 0),
      0
    );

    // ✅ Fix balance logic
    let balance;
    if (expenseType === "Receipt") {
      balance = totalReceipt + amount + receiptAmount - totalExpense;
    } else {
      balance = totalReceipt + receiptAmount - (totalExpense + amount);
    }

    const newEntry = new ExpenseEntry({
      date,
      expenseType,
      amount,
      description,
      receiptAmount,
      balance,
    });

    const saved = await newEntry.save();
    return NextResponse.json(
      {
        message: "Expense saved successfully",
        savedEntry: saved,
        totalExpense,
        balance,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add Expense", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    const all = await ExpenseEntry.find().sort({ createdAt: -1 });
    return NextResponse.json(all, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch expenses", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    const body = await req.json();
    const { id, ...rest } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID is required for update" },
        { status: 400 }
      );
    }

    const updated = await ExpenseEntry.findByIdAndUpdate(id, rest, {
      new: true,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update expense", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const deleted = await ExpenseEntry.findByIdAndDelete(id);

    return NextResponse.json(
      { message: "Deleted successfully", deleted },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Deletion failed", details: error.message },
      { status: 500 }
    );
  }
}
