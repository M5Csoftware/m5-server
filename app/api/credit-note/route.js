import CreditNote from "@/app/model/CreditNote";
import AccountLedger from "@/app/model/AccountLedger";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Ensure DB connection
connectDB();

// GET - Fetch credit notes or month files
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
      const distinctMonthFiles = await CreditNote.distinct("monthFile");
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
      const creditNotes = await CreditNote.find(query).sort({ createdAt: -1 });
      return NextResponse.json(creditNotes, { status: 200 });
    } else {
      const allCreditNotes = await CreditNote.find({}).sort({ createdAt: -1 });
      return NextResponse.json(allCreditNotes, { status: 200 });
    }
  } catch (error) {
    console.error("Error in fetching Credit Notes:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch Credit Notes", details: error.message },
      { status: 400 }
    );
  }
}

// POST - Create new credit note
export async function POST(req) {
  try {
    const body = await req.json();
    console.log("Request body:", body);

    // Validate required fields
    if (!body.fYear || !body.clientDetails || !body.amountDetails || !body.creditItems || body.creditItems.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Save credit note to database
    const creditNote = new CreditNote(body);
    const savedCreditNote = await creditNote.save();
    console.log("Credit Note saved:", savedCreditNote);

    // Create account ledger entries for each AWB
    try {
      const invoiceNo = savedCreditNote.clientDetails.invoiceNo;
      const invoiceDate = savedCreditNote.clientDetails.invoiceDate;
      const accountCode = savedCreditNote.clientDetails.accountCode;
      const grandTotal = savedCreditNote.amountDetails.grandTotal;
      const sgst = savedCreditNote.amountDetails.sgst;
      const cgst = savedCreditNote.amountDetails.cgst;
      const igst = savedCreditNote.amountDetails.igst;

      // Process each credit item (AWB)
      for (const item of savedCreditNote.creditItems) {
        // Check if AWB already exists in account ledger
        const existingEntry = await AccountLedger.findOne({ 
          awbNo: item.awbNo,
          accountCode: accountCode 
        }).sort({ date: -1, createdAt: -1 });

        let newLeftOverBalance;

        if (existingEntry) {
          // AWB exists - Get the last leftOverBalance for THIS SPECIFIC AWB and subtract grandTotal
          const previousBalance = existingEntry.leftOverBalance || 0;
          newLeftOverBalance = previousBalance - grandTotal;

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
            operationRemark: `Credit Note: ${invoiceNo} dated ${new Date(invoiceDate).toLocaleDateString('en-GB')}`,
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
          // AWB doesn't exist in ledger - set leftOverBalance to 0
          newLeftOverBalance = 0;

          console.log(`AWB ${item.awbNo} does NOT exist - Setting leftOverBalance to 0`);

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
            operationRemark: `Credit Note: ${invoiceNo} dated ${new Date(invoiceDate).toLocaleDateString('en-GB')}`,
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
        message: "Credit note created successfully",
        data: savedCreditNote 
      }, 
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in creating Credit Note:", error.message, error.stack);
    return NextResponse.json(
      { error: "Failed to create Credit Note", details: error.message },
      { status: 400 }
    );
  }
}

// PUT - Update credit note
export async function PUT(req) {
  try {
    const body = await req.json();
    console.log("PUT body:", body);

    const invoiceNo = body.clientDetails?.invoiceNo;
    if (!invoiceNo) {
      throw new Error("invoiceNo is required for updating");
    }

    const updatedCreditNote = await CreditNote.findOneAndUpdate(
      { "clientDetails.invoiceNo": invoiceNo },
      { $set: body },
      { new: true }
    );

    if (!updatedCreditNote) {
      throw new Error("Credit note not found for update");
    }

    console.log("Updated Credit Note:", updatedCreditNote);
    return NextResponse.json(
      {
        message: "Credit note updated successfully",
        data: updatedCreditNote
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in updating Credit Note:", error.message, error.stack);
    return NextResponse.json(
      { error: "Failed to update Credit Note", details: error.message },
      { status: 400 }
    );
  }
}

// DELETE - Delete credit note
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

    const deletedCreditNote = await CreditNote.findOneAndDelete({
      "clientDetails.invoiceNo": invoiceNo,
    });

    if (!deletedCreditNote) {
      return NextResponse.json(
        { error: "Credit note not found" },
        { status: 404 }
      );
    }

    // Delete related account ledger entries
    try {
      const awbNumbers = deletedCreditNote.creditItems.map(item => item.awbNo).filter(Boolean);
      
      if (awbNumbers.length > 0) {
        // Delete ledger entries that reference this credit note
        await AccountLedger.deleteMany({
          awbNo: { $in: awbNumbers },
          operationRemark: { $regex: `Credit Note: ${invoiceNo}` }
        });
        console.log(`Deleted account ledger entries for ${awbNumbers.length} AWBs`);
      }
    } catch (ledgerError) {
      console.error("Error deleting account ledger entries:", ledgerError);
    }

    return NextResponse.json(
      { message: "Credit note deleted successfully", data: deletedCreditNote },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Deletion failed", details: error.message },
      { status: 500 }
    );
  }
}