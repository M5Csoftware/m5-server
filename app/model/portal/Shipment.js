import mongoose from "mongoose";

const ShipmentSchema = new mongoose.Schema(
  {
    //unique ids
    awbNo: { type: String, default: "", unique: true },
    accountCode: { type: String, required: true },

    // Shipment Details
    status: { type: String, default: "Shipment Created!" },
    date: { type: Date, required: true },
    sector: { type: String, required: true },
    origin: { type: String, required: false },
    destination: { type: String, default: "" },
    reference: { type: String, default: "" },
    forwardingNo: { type: String, default: "" },
    forwarder: { type: String, default: "" },
    goodstype: { type: String, default: "" },
    payment: { type: String, default: "" },
    // shipmentType: {
    //   type: String,
    //   required: true,
    //   enum: ["Document", "Non-Document", "Commercial (CSBV)"],
    // },
    boxes: { type: Array, default: [] },

    // Weights & Values
    chargeableWt: { type: Number, default: 0 },
    totalActualWt: { type: Number, default: 0 },
    totalVolWt: { type: Number, default: 0 },
    totalInvoiceValue: { type: Number, default: 0 },
    content: { type: Array, default: "" },

    // Flags
    operationRemark: { type: String, default: "" },
    automation: { type: Boolean, default: false },
    handling: { type: Boolean, default: false },
    csb: { type: Boolean, default: false },
    commercialShipment: { type: Boolean, default: false },
    isHold: { type: Boolean, default: false },
    holdReason: { type: String, default: "" },
    otherHoldReason: { type: String, default: "" },

    // Charges & Billing
    basicAmt: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    totalAmt: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountAmt: { type: Number, default: 0 },
    duty: { type: Number, default: 0 },
    fuelAmt: { type: Number, default: 0 },
    fuelPercentage: { type: Number, default: 0 },
    handlingAmount: { type: Number, default: 0 },
    hikeAmt: { type: Number, default: 0 },
    manualAmount: { type: Number, default: 0 },
    miscChg: { type: Number, default: 0 },
    miscChgReason: { type: String, default: "" },
    overWtHandling: { type: Number, default: 0 },
    volDisc: { type: Number, default: 0 },
    cashRecvAmount: { type: Number, default: 0 },

    // References
    billNo: { type: String, default: "" },
    manifestNo: { type: String, default: "" },
    runNo: { type: String, default: "" }, // Added runNo field
    alMawb: { type: String, default: "" },
    bag: { type: String, default: "" },
    clubNo: { type: String, default: "" },
    company: { type: String, default: "" },
    currency: { type: String, default: "" },
    currencys: { type: String, default: "" },
    customer: { type: String, default: "" },
    flight: { type: String, default: "" },
    network: { type: String, default: "" },
    networkName: { type: String, default: "" },
    obc: { type: String, default: "" },
    service: { type: String, default: "" },

    pcs: { type: Number, default: 0 },

    // NEW: localM/F field for branch bagging run number assignment
    localMF: {
      type: String,
      default: ""
    },

    // Receiver (Consignee)
    receiverFullName: { type: String, default: "" },
    receiverPhoneNumber: { type: String, default: "" },
    receiverEmail: { type: String, default: "" },
    receiverAddressLine1: { type: String, default: "" },
    receiverAddressLine2: { type: String, default: "" },
    receiverCity: { type: String, default: "" },
    receiverState: { type: String, default: "" },
    receiverCountry: { type: String, default: "" },
    receiverPincode: { type: String, default: "" },

    // Shipper (Consignor)
    shipperFullName: { type: String, default: "" },
    shipperPhoneNumber: { type: String, default: "" },
    shipperEmail: { type: String, default: "" },
    shipperAddressLine1: { type: String, default: "" },
    shipperAddressLine2: { type: String, default: "" },
    shipperCity: { type: String, default: "" },
    shipperState: { type: String, default: "" },
    shipperCountry: { type: String, default: "" },
    shipperPincode: { type: String, default: "" },
    shipperKycType: { type: String, default: "other" },
    shipperKycNumber: { type: String, default: "" },

    // Invoice
    shipmentAndPackageDetails: { type: Object, default: {} },
    coLoader: { type: String, default: "" },
    coLoaderNumber: { type: Number, default: 0 },

    //user
    insertUser: { type: String, default: "" },
    updateUser: { type: String, default: "" },

    //modified
    billingLocked: { type: Boolean, default: false },
    awbStatus: { type: String, default: "" },

    // Invoice Billing Flags
    isBilled: { type: Boolean, default: false },
    billNo: { type: String, default: "" },
    notifType: { type: String, default: "" },
    notifMsg: { type: String, default: "" },
    runDate: { type: Date, default: "" },

    //complete data lock
    completeDataLock: { type: Boolean, default: false },

    //csb-v data
    exporter: {
      type: String,
      // required: [true, "Exporter name is required"],
      trim: true,
    },

    kycNumber: {
      type: String,
      // required: [true, "KYC Number is required"],
      trim: true,
    },

    iec: {
      type: String,
      // required: [true, "IEC Code is required"],
      trim: true,
    },

    apiBooking: {
      type: Boolean,
      default: false,
    },

    gstNumber: {
      type: String,
      trim: true,
      default: "",
    },

    adCode: {
      type: String,
      trim: true,
      default: "",
    },

    termsOfInvoice: {
      type: String,
      default: "",
    },

    crnNumber: {
      type: String,
      trim: true,
      default: "",
    },

    mhbsNumber: {
      type: String,
      trim: true,
      default: "",
    },

    exportThroughEcommerce: {
      type: Boolean,
      default: false,
    },

    meisScheme: {
      type: Boolean,
      default: false,
    },

  },
  { timestamps: true }
);

export default mongoose.models.Shipment ||
  mongoose.model("Shipment", ShipmentSchema);