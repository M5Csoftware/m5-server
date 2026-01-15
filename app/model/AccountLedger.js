import mongoose from "mongoose";

const AccountLedgerSchema = new mongoose.Schema({
  //customer
  accountCode: { type: String, required: true },
  customer: { type: String, default: "" },
  openingBalance: { type: Number, default: 0 },
  email: { type: String, default: "" },

  //with hold filter -> isHold
  isHold: { type: Boolean, default: false },

  //account ledger table
  awbNo: { type: String, default: "" },
  payment: { type: String, default: "" }, //Type
  date: { type: Date },
  receiverFullName: { type: String, default: "" }, //Consignee
  forwarder: { type: String, default: "" },
  forwardingNo: { type: String, default: "" },
  runNo: { type: String, default: "" },
  sector: { type: String, default: "" },
  destination: { type: String, default: "" },
  receiverCity: { type: String, default: "" }, //City
  receiverPincode: { type: String, default: "" }, //Zipcode
  service: { type: String, default: "" }, 
  pcs: { type: Number, default: 0 },
  totalActualWt: { type: Number, default: 0 },
  totalVolWt: { type: Number, default: 0 },
  basicAmt: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  hikeAmt: { type: Number, default: 0 }, //Rate hike
  sgst: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  miscChg: { type: Number, default: 0 },
  fuelAmt: { type: Number, default: 0 },
  nonTaxable: { type: Number, default: 0 },
  totalAmt: { type: Number, default: 0 }, //Grand Total and Balance
  debitAmount: { type: Number, default: 0 },
  creditAmount: { type: Number, default: 0 },
  operationRemark: { type: String, default: "" }, //Remark
  reference: { type: String, default: "" },
  leftOverBalance: { type: Number, default: 0 }, //Total remaining Balance

  //extras for functionality
  receivedAmount: {type: Number, default:0},
});

const AccountLedger =
  mongoose.models.AccountLedger ||
  mongoose.model("AccountLedger", AccountLedgerSchema);

export default AccountLedger;
