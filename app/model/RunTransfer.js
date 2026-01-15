// models/RunTransfer.js
import mongoose from "mongoose";

const airwayBillSchema = new mongoose.Schema(
  {
    HAWBNumber: { type: String, required: true },
    ConsignorName: { type: String },
    ConsignorAddress1: { type: String },
    ConsignorAddress2: { type: String },
    ConsignorCity: { type: String },
    ConsignorState: { type: String },
    ConsignorPostalCode: { type: String },
    ConsignorCountry: { type: String },

    ConsigneeName: { type: String },
    ConsigneeAddress1: { type: String },
    ConsigneeAddress2: { type: String },
    ConsigneeCity: { type: String },
    ConsigneeState: { type: String },
    ConsigneePostalCode: { type: String },
    ConsigneeCountry: { type: String },

    PKG: { type: Number },
    Weight: { type: Number },
    DescriptionofGoods: { type: String },
    Value: { type: Number },

    ExportInvoiceNo: { type: String },
    GSTInvoiceNo: { type: String },
    InvoiceValue: { type: Number },
    CurrencyType: { type: String },
    PayType: { type: String },
    IGSTPaid: { type: String },
    Bond: { type: String },
    MHBSNo: { type: String },

    GSTINType: { type: String },
    GSTINNumber: { type: String },
    GSTDate: { type: Date },
    ExportDate: { type: Date },
    ADCode: { type: String },

    CRN_NO: { type: String },
    CRN_MHBS_NO: { type: String },
  },
  { _id: false } // don't create extra _id for each airwayBill
);

const RunTransferSchema = new mongoose.Schema(
  {
    runNo: { type: String, required: true, index: true }, // one runNo per transfer
    runEntry: { type: mongoose.Schema.Types.Mixed }, // if you want to store extra run-level data
    airwayBill: [airwayBillSchema], // multiple shipments under one run
  },
  { timestamps: true }
);

export default mongoose.models.RunTransfer ||
  mongoose.model("RunTransfer", RunTransferSchema);
