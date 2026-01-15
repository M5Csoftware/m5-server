import mongoose from "mongoose";

const creditNoteSchema = new mongoose.Schema(
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
        // Credit Note Serial Number
      },
      invoiceNo: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
        // Credit Note Number
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
    // Credit Note Items (AWB wise credits)
    creditItems: [
      {
        awbNo: {
          type: String,
          required: true,
          trim: true,
        },
        creditAmount: {
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
creditNoteSchema.index({ "clientDetails.invoiceNo": 1 });
creditNoteSchema.index({ "clientDetails.accountCode": 1 });
creditNoteSchema.index({ fYear: 1 });
creditNoteSchema.index({ monthFile: 1 });
creditNoteSchema.index({ "clientDetails.invoiceDate": 1 });
creditNoteSchema.index({ status: 1 });
creditNoteSchema.index({ relatedInvoiceNo: 1 });

// Compound indexes for common queries
creditNoteSchema.index({ fYear: 1, "clientDetails.branch": 1 });
creditNoteSchema.index({ monthFile: 1, "clientDetails.branch": 1 });
creditNoteSchema.index({ 
  "clientDetails.accountCode": 1, 
  "clientDetails.invoiceDate": -1 
});
creditNoteSchema.index({ 
  fYear: 1, 
  status: 1, 
  "clientDetails.branch": 1 
});

// Virtual for total credit items
creditNoteSchema.virtual("totalCreditItems").get(function () {
  return this.creditItems.length;
});

// Virtual for sum of all credit amounts
creditNoteSchema.virtual("totalCreditAmount").get(function () {
  return this.creditItems.reduce((sum, item) => sum + (item.creditAmount || 0), 0);
});

// Pre-save middleware to calculate grand total
creditNoteSchema.pre("save", function (next) {
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
creditNoteSchema.methods.validateGST = function () {
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

// Static method to find credit notes by customer
creditNoteSchema.statics.findByCustomer = function (accountCode, fYear = null) {
  const query = { "clientDetails.accountCode": accountCode };
  if (fYear) {
    query.fYear = fYear;
  }
  return this.find(query).sort({ "clientDetails.invoiceDate": -1 });
};

// Static method to find credit notes by AWB
creditNoteSchema.statics.findByAWB = function (awbNo) {
  return this.find({ "creditItems.awbNo": awbNo });
};

const CreditNote = mongoose.models.CreditNote || mongoose.model("CreditNote", creditNoteSchema);

export default CreditNote;