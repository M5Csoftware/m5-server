import mongoose from "mongoose";

const debitNoteSchema = new mongoose.Schema(
  {
    fYear: {
      type: String,
      required: true,
      trim: true,
      // Format: "2024-2025"
    },
    monthFile: {
      type: String,
      required: true,
      trim: true,
      // Month/Year format
    },
    // Client Details
    clientDetails: {
      branch: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },
      invoiceDate: {
        type: Date,
        required: true,
      },
      invoiceSrNo: {
        type: String,
        required: true,
        trim: true,
        // Debit Note Serial Number
      },
      invoiceNo: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
        // Debit Note Number (starts with DR)
      },
      accountCode: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },
      customerName: {
        type: String,
        required: true,
        trim: true,
      },
      gstNo: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      forwarding: {
        type: String,
        trim: true,
      },
    },
    // Amount Details
    amountDetails: {
      amount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        // Base amount before taxes
      },
      sgst: {
        type: Number,
        default: 0,
        min: 0,
        // State GST
      },
      cgst: {
        type: Number,
        default: 0,
        min: 0,
        // Central GST
      },
      igst: {
        type: Number,
        default: 0,
        min: 0,
        // Integrated GST
      },
      grandTotal: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        // Total amount including all taxes
      },
    },
    // Debit Note Items (AWB wise debits)
    debitItems: [
      {
        awbNo: {
          type: String,
          required: true,
          trim: true,
        },
        debitAmount: {
          type: Number,
          required: true,
          default: 0,
          min: 0,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Create indexes for efficient querying
debitNoteSchema.index({ "clientDetails.invoiceNo": 1 });
debitNoteSchema.index({ "clientDetails.accountCode": 1 });
debitNoteSchema.index({ fYear: 1 });
debitNoteSchema.index({ monthFile: 1 });
debitNoteSchema.index({ "clientDetails.invoiceDate": 1 });
debitNoteSchema.index({ status: 1 });
debitNoteSchema.index({ relatedInvoiceNo: 1 });

// Compound indexes for common queries
debitNoteSchema.index({ fYear: 1, "clientDetails.branch": 1 });
debitNoteSchema.index({ monthFile: 1, "clientDetails.branch": 1 });
debitNoteSchema.index({ 
  "clientDetails.accountCode": 1, 
  "clientDetails.invoiceDate": -1 
});
debitNoteSchema.index({ 
  fYear: 1, 
  status: 1, 
  "clientDetails.branch": 1 
});

// Virtual for total debit items
debitNoteSchema.virtual("totalDebitItems").get(function () {
  return this.debitItems.length;
});

// Virtual for sum of all debit amounts
debitNoteSchema.virtual("totalDebitAmount").get(function () {
  return this.debitItems.reduce((sum, item) => sum + (item.debitAmount || 0), 0);
});

// Pre-save middleware to calculate grand total
debitNoteSchema.pre("save", function (next) {
  if (this.amountDetails) {
    const amount = this.amountDetails.amount || 0;
    const sgst = this.amountDetails.sgst || 0;
    const cgst = this.amountDetails.cgst || 0;
    const igst = this.amountDetails.igst || 0;
    
    // Calculate grand total
    this.amountDetails.grandTotal = amount + sgst + cgst + igst;
  }
  next();
});

// Method to validate GST calculation
debitNoteSchema.methods.validateGST = function () {
  const { amount, sgst, cgst, igst } = this.amountDetails;
  
  // If IGST is used, SGST and CGST should be 0
  if (igst > 0 && (sgst > 0 || cgst > 0)) {
    return {
      valid: false,
      message: "IGST cannot be used with SGST/CGST"
    };
  }
  
  // If SGST/CGST is used, they should be equal
  if (sgst > 0 || cgst > 0) {
    if (sgst !== cgst) {
      return {
        valid: false,
        message: "SGST and CGST must be equal"
      };
    }
  }
  
  return { valid: true };
};

// Static method to find debit notes by customer
debitNoteSchema.statics.findByCustomer = function (accountCode, fYear = null) {
  const query = { "clientDetails.accountCode": accountCode };
  if (fYear) {
    query.fYear = fYear;
  }
  return this.find(query).sort({ "clientDetails.invoiceDate": -1 });
};

// Static method to find debit notes by AWB
debitNoteSchema.statics.findByAWB = function (awbNo) {
  return this.find({ "debitItems.awbNo": awbNo });
};

const DebitNote = mongoose.models.DebitNote || mongoose.model("DebitNote", debitNoteSchema);

export default DebitNote;