import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";

// ============ BALANCE CALCULATION UTILITY ============
function calculateBalanceAndCredit(balance, credit, amount) {
  // If balance is positive (customer has wallet balance)
  if (balance >= 0) {
    if (balance >= amount) {
      // Deduct from wallet balance
      return {
        insufficient: false,
        newBalance: Number((balance - amount).toFixed(2)),
        newCredit: Number(credit.toFixed(2)),
        usedCredit: 0,
        usedBalance: amount,
        message: "Amount deducted from wallet balance"
      };
    } else {
      // Need to use credit for remaining amount
      const remainingAmount = Number((amount - balance).toFixed(2));
      
      if (credit >= remainingAmount) {
        // Enough credit available
        return {
          insufficient: false,
          newBalance: 0,
          newCredit: Number((credit - remainingAmount).toFixed(2)),
          usedCredit: remainingAmount,
          usedBalance: balance,
          message: `₹${balance} deducted from wallet, ₹${remainingAmount} from credit`
        };
      } else {
        // Insufficient credit
        return {
          insufficient: true,
          newBalance: balance,
          newCredit: credit,
          deficit: Number((remainingAmount - credit).toFixed(2)),
          requiredAmount: amount,
          availableBalance: balance,
          availableCredit: credit,
          message: "Credit limit exceeded"
        };
      }
    }
  } 
  // If balance is negative (customer owes money)
  else {
    const absoluteBalance = Math.abs(balance);
    
    if (absoluteBalance >= amount) {
      // Reduce the negative balance
      return {
        insufficient: false,
        newBalance: Number((balance + amount).toFixed(2)),
        newCredit: Number(credit.toFixed(2)),
        usedCredit: 0,
        usedBalance: amount,
        message: `Outstanding balance reduced by ₹${amount}`
      };
    } else {
      // Need to use credit for remaining amount after clearing negative balance
      const remainingAfterClearance = Number((amount - absoluteBalance).toFixed(2));
      
      if (credit >= remainingAfterClearance) {
        return {
          insufficient: false,
          newBalance: 0,
          newCredit: Number((credit - remainingAfterClearance).toFixed(2)),
          usedCredit: remainingAfterClearance,
          usedBalance: absoluteBalance,
          message: `Outstanding balance cleared, ₹${remainingAfterClearance} deducted from credit`
        };
      } else {
        // Insufficient credit
        return {
          insufficient: true,
          newBalance: balance,
          newCredit: credit,
          deficit: Number((remainingAfterClearance - credit).toFixed(2)),
          requiredAmount: amount,
          availableBalance: balance,
          availableCredit: credit,
          message: "Credit limit exceeded even after adjusting outstanding balance"
        };
      }
    }
  }
}

// ============ POST - UPDATE BALANCE ============
export async function POST(req) {
  try {
    console.log("=== BALANCE UPDATE API CALLED ===");
    await connectDB();

    const { accountCode, shipmentAmount } = await req.json();
    console.log("Request payload:", { accountCode, shipmentAmount });

    if (!accountCode || shipmentAmount === undefined) {
      console.log("Missing required fields");
      return NextResponse.json(
        { success: false, message: "accountCode and shipmentAmount are required" },
        { status: 400 }
      );
    }

    // Find the customer account
    const customer = await CustomerAccount.findOne({ 
      accountCode: accountCode.toUpperCase() 
    });
    
    if (!customer) {
      console.log("Customer not found for accountCode:", accountCode);
      return NextResponse.json(
        { success: false, message: "Customer account not found" },
        { status: 404 }
      );
    }

    console.log("Customer found:", {
      accountCode: customer.accountCode,
      customerName: customer.name,
      currentBalance: customer.leftOverBalance,
      currentCredit: customer.creditLimit
    });

    // Convert to numbers to ensure proper calculation
    const currentBalance = Number(customer.leftOverBalance) || 0;
    const currentCredit = Number(customer.creditLimit) || 0;
    const amount = Number(shipmentAmount) || 0;

    // Check if customer has sufficient balance/credit
    const result = calculateBalanceAndCredit(currentBalance, currentCredit, amount);

    if (result.insufficient) {
      console.log("❌ INSUFFICIENT BALANCE/CREDIT:", result);
      
      return NextResponse.json(
        { 
          success: false, 
          message: "Insufficient balance/credit. Please recharge your account.",
          currentBalance: currentBalance,
          currentCredit: currentCredit,
          requiredAmount: amount,
          deficit: result.deficit,
          shortfall: result.deficit,
          details: result
        },
        { status: 400 }
      );
    }

    // Update the customer balance and credit
    customer.leftOverBalance = result.newBalance;
    customer.creditLimit = result.newCredit;
    
    await customer.save();

    console.log("✅ Balance updated successfully:", {
      previousBalance: currentBalance,
      previousCredit: currentCredit,
      deductedAmount: amount,
      newBalance: result.newBalance,
      newCredit: result.newCredit,
      usedBalance: result.usedBalance || 0,
      usedCredit: result.usedCredit || 0
    });

    return NextResponse.json({
      success: true,
      message: "Balance updated successfully",
      data: {
        previousBalance: currentBalance,
        previousCredit: currentCredit,
        deductedAmount: amount,
        newBalance: result.newBalance,
        newCredit: result.newCredit,
        usedBalance: result.usedBalance || 0,
        usedCredit: result.usedCredit || 0
      }
    });

  } catch (error) {
    console.error("❌ Balance Update Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error", error: error.message },
      { status: 500 }
    );
  }
}

// ============ GET - CHECK BALANCE ============
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "accountCode is required" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({ 
      accountCode: accountCode.toUpperCase() 
    });
    
    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer account not found" },
        { status: 404 }
      );
    }

    // Check if customer has any outstanding balance
    const hasOutstanding = customer.leftOverBalance < 0;
    const outstandingAmount = hasOutstanding ? Math.abs(customer.leftOverBalance) : 0;

    return NextResponse.json({
      success: true,
      data: {
        leftOverBalance: Number(customer.leftOverBalance || 0).toFixed(2),
        creditLimit: Number(customer.creditLimit || 0).toFixed(2),
        hasOutstanding: hasOutstanding,
        outstandingAmount: outstandingAmount.toFixed(2),
        customerName: customer.name,
        customerEmail: customer.email
      }
    });

  } catch (error) {
    console.error("❌ Balance Fetch Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error", error: error.message },
      { status: 500 }
    );
  }
}