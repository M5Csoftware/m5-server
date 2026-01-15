import DebitNote from "@/app/model/DebitNote";
import AccountLedger from "@/app/model/AccountLedger";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Ensure DB connection
connectDB();

// GET - Fetch debit notes or month files
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceNo = searchParams.get("invoiceNo");
    const accountCode = searchParams.get("accountCode");
    const branch = searchParams.get("branch");
    const fYear = searchParams.get("fYear");    
    const monthFiles = searchParams.get("monthFiles");

    // Fetch unique month files
    if (monthFiles === "true") {
      const distinctMonthFiles = await DebitNote.distinct("monthFile");
      return NextResponse.json({ monthFiles: distinctMonthFiles }, { status: 200 });
    }

    let query = {};

    if (invoiceNo) {
      query["clientDetails.invoiceNo"] = invoiceNo;
    }
    if (accountCode) {
      query["clientDetails.accountCode"] = accountCode;
    }
    if (branch) {
      query["clientDetails.branch"] = branch;
    }
    if (fYear) {
      query.fYear = fYear;
    }

    if (Object.keys(query).length > 0) {
      const debitNotes = await DebitNote.find(query).sort({ createdAt: -1 });
      return NextResponse.json(debitNotes, { status: 200 });
    } else {
      const allDebitNotes = await DebitNote.find({}).sort({ createdAt: -1 });
      return NextResponse.json(allDebitNotes, { status: 200 });
    }
  } catch (error) {
    console.error("Error in fetching Debit Notes:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch Debit Notes", details: error.message },
      { status: 400 }
    );
  }
}

// POST - Create new debit note
export async function POST(req) {
  try {
    const body = await req.json();
    console.log("Request body:", body);

    // Validate required fields
    if (!body.fYear || !body.clientDetails || !body.amountDetails || !body.debitItems || body.debitItems.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Save debit note to database
    const debitNote = new DebitNote(body);
    const savedDebitNote = await debitNote.save();
    console.log("Debit Note saved:", savedDebitNote);

    // Create account ledger entries for each AWB
    try {
      const invoiceNo = savedDebitNote.clientDetails.invoiceNo;
      const invoiceDate = savedDebitNote.clientDetails.invoiceDate;
      const accountCode = savedDebitNote.clientDetails.accountCode;
      const grandTotal = savedDebitNote.amountDetails.grandTotal;
      const sgst = savedDebitNote.amountDetails.sgst;
      const cgst = savedDebitNote.amountDetails.cgst;
      const igst = savedDebitNote.amountDetails.igst;

      // Process each debit item (AWB)
      for (const item of savedDebitNote.debitItems) {
        // Check if AWB already exists in account ledger
        const existingEntry = await AccountLedger.findOne({ 
          awbNo: item.awbNo,
          accountCode: accountCode 
        }).sort({ date: -1, createdAt: -1 });

        let newLeftOverBalance;

        if (existingEntry) {
          // AWB exists - Get the last leftOverBalance for THIS SPECIFIC AWB and ADD grandTotal
          const previousBalance = existingEntry.leftOverBalance || 0;
          newLeftOverBalance = previousBalance + grandTotal;

          console.log(`AWB ${item.awbNo} exists - Previous balance: ${previousBalance}, Grand Total: ${grandTotal}, New balance: ${newLeftOverBalance}`);

          // Create new account ledger entry
          const ledgerEntry = new AccountLedger({
            accountCode: accountCode,
            awbNo: item.awbNo,
            date: invoiceDate,
            sgst: sgst,
            cgst: cgst,
            igst: igst,
            totalAmt: grandTotal,
            creditAmount: 0,
            debitAmount: 0,
            leftOverBalance: newLeftOverBalance,
            operationRemark: `Debit Note: ${invoiceNo} dated ${new Date(invoiceDate).toLocaleDateString('en-GB')}`,
            // Copy other relevant fields from existing entry
            customer: existingEntry.customer,
            email: existingEntry.email,
            isHold: existingEntry.isHold,
            payment: existingEntry.payment,
            receiverFullName: existingEntry.receiverFullName,
            forwarder: existingEntry.forwarder,
            forwardingNo: existingEntry.forwardingNo,
            runNo: existingEntry.runNo,
            sector: existingEntry.sector,
            destination: existingEntry.destination,
            receiverCity: existingEntry.receiverCity,
            receiverPincode: existingEntry.receiverPincode,
            service: existingEntry.service,
            pcs: existingEntry.pcs,
            totalActualWt: existingEntry.totalActualWt,
            totalVolWt: existingEntry.totalVolWt,
            basicAmt: 0,
            discount: 0,
            discountAmount: 0,
            hikeAmt: 0,
            miscChg: 0,
            fuelAmt: 0,
            nonTaxable: 0,
            reference: existingEntry.reference,
            openingBalance: existingEntry.openingBalance,
          });

          await ledgerEntry.save();
          console.log(`Account ledger entry created for existing AWB: ${item.awbNo}, leftOverBalance: ${newLeftOverBalance}`);
        } else {
          // AWB doesn't exist in ledger - set leftOverBalance to grandTotal (adding to 0)
          newLeftOverBalance = grandTotal;

          console.log(`AWB ${item.awbNo} does NOT exist - Setting leftOverBalance to ${grandTotal}`);

          const ledgerEntry = new AccountLedger({
            accountCode: accountCode,
            awbNo: item.awbNo,
            date: invoiceDate,
            sgst: sgst,
            cgst: cgst,
            igst: igst,
            totalAmt: grandTotal,
            creditAmount: 0,
            debitAmount: 0,
            leftOverBalance: newLeftOverBalance,
            operationRemark: `Debit Note: ${invoiceNo} dated ${new Date(invoiceDate).toLocaleDateString('en-GB')}`,
            openingBalance: 0,
            basicAmt: 0,
            discount: 0,
            discountAmount: 0,
            hikeAmt: 0,
            miscChg: 0,
            fuelAmt: 0,
            nonTaxable: 0,
            pcs: 0,
            totalActualWt: 0,
            totalVolWt: 0,
          });

          await ledgerEntry.save();
          console.log(`New account ledger entry created for new AWB: ${item.awbNo}, leftOverBalance: ${newLeftOverBalance}`);
        }
      }

      console.log("Account ledger entries created successfully");
    } catch (ledgerError) {
      console.error("Error creating account ledger entries:", ledgerError);
      // Don't fail the entire request if ledger creation fails
    }

    return NextResponse.json(
      { 
        message: "Debit note created successfully",
        data: savedDebitNote 
      }, 
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in creating Debit Note:", error.message, error.stack);
    return NextResponse.json(
      { error: "Failed to create Debit Note", details: error.message },
      { status: 400 }
    );
  }
}

// PUT - Update debit note
export async function PUT(req) {
  try {
    const body = await req.json();
    console.log("PUT body:", body);

    const invoiceNo = body.clientDetails?.invoiceNo;
    if (!invoiceNo) {
      throw new Error("invoiceNo is required for updating");
    }

    const updatedDebitNote = await DebitNote.findOneAndUpdate(
      { "clientDetails.invoiceNo": invoiceNo },
      { $set: body },
      { new: true }
    );

    if (!updatedDebitNote) {
      throw new Error("Debit note not found for update");
    }

    console.log("Updated Debit Note:", updatedDebitNote);
    return NextResponse.json(
      {
        message: "Debit note updated successfully",
        data: updatedDebitNote
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in updating Debit Note:", error.message, error.stack);
    return NextResponse.json(
      { error: "Failed to update Debit Note", details: error.message },
      { status: 400 }
    );
  }
}

// DELETE - Delete debit note
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceNo = searchParams.get("invoiceNo");

    if (!invoiceNo) {
      return NextResponse.json(
        { error: "Invoice number is required" },
        { status: 400 }
      );
    }

    const deletedDebitNote = await DebitNote.findOneAndDelete({
      "clientDetails.invoiceNo": invoiceNo,
    });

    if (!deletedDebitNote) {
      return NextResponse.json(
        { error: "Debit note not found" },
        { status: 404 }
      );
    }

    // Delete related account ledger entries
    try {
      const awbNumbers = deletedDebitNote.debitItems.map(item => item.awbNo).filter(Boolean);
      
      if (awbNumbers.length > 0) {
        // Delete ledger entries that reference this debit note
        await AccountLedger.deleteMany({
          awbNo: { $in: awbNumbers },
          operationRemark: { $regex: `Debit Note: ${invoiceNo}` }
        });
        console.log(`Deleted account ledger entries for ${awbNumbers.length} AWBs`);
      }
    } catch (ledgerError) {
      console.error("Error deleting account ledger entries:", ledgerError);
    }

    return NextResponse.json(
      { message: "Debit note deleted successfully", data: deletedDebitNote },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Deletion failed", details: error.message },
      { status: 500 }
    );
  }
}