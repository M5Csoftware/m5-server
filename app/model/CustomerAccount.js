import mongoose from "mongoose";

const CustomerAccountSchema = new mongoose.Schema(
  {
    accountType: { type: String, required: true },
    accountCode: { type: String, default: "", unique: true },
    name: { type: String, default: "" },
    addressLine1: { type: String, default: "" },
    addressLine2: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    pinCode: { type: String, default: "" },
    contactPerson: { type: String, default: "" },
    email: { type: String, default: "" },
    telNo: { type: String, default: "" },
    panNo: { type: String, default: "" },
    tanNo: { type: String, default: "" },
    gstNo: { type: String, default: "" },
    kycNo: { type: String, default: "" },
    branch: { type: String, default: "" },
    hub: { type: String, default: "" },
    companyName: { type: String, default: "" },
    salesPersonName: { type: String, default: "" },
    referenceBy: { type: String, default: "" },
    managedBy: { type: String, default: "" },
    collectionBy: { type: String, default: "" },
    accountManager: { type: String, default: "" },
    reportPerson: { type: String, default: "" },
    salesCoordinator: { type: String, default: "" },
    applicableTariff: { type: String, default: "" },
    gst: { type: String, default: "" },
    account: { type: String, default: "Activate" },
    fuel: { type: String, default: "" },
    rateModify: { type: String, default: "" },
    billingEmailId: { type: String, default: "" },
    paymentTerms: { type: String, default: "" },
    rateType: { type: String, default: "" },
    parentCode: { type: String, default: "" },
    billingTag: { type: String, default: "" },
    currency: { type: String, default: "" },
    csb: { type: String, default: "" },
    branded: { type: String, default: "" },
    handling: { type: String, default: "" },
    modeType: { type: String, default: "" },
    deactivateReason: { type: String, default: "" },
    enableOS: { type: Boolean, default: false },
    openingBalance: { type: String, default: "" },
    // creditLimit: { type: String, default: "" },
    creditLimit: {type: Number, default: 0 },
    leftOverBalance: { type: Number, default: 0 },
    noOfDaysCredit: { type: String, default: "" },
    portalBalance: { type: String, default: "" },
    volumeMetricWtSector: { type: String, default: "" },
    volumeMetricWtService: { type: String, default: "" },
    divisible: { type: String, default: "" },
    volWtDivisibleTable: { type: Array, default: [] },
    allServiceSettings: { type: Boolean, default: false },
    serviceSettingsSector: { type: String, default: "" },
    serviceSettingsService: { type: String, default: "" },
    serviceSettingVolDiscTable: { type: Array, default: [] },
    serviceSettingServiceTable: { type: Array, default: [] },
    enableVolDiscount: { type: Boolean, default: false },
    deactivateStatus: { type: Boolean, default: false },
    deactivateReasonModal: { type: String, default: "" },
    volDiscountSector: { type: String, default: "" },
    volDiscountService: { type: String, default: "" },
    volDiscountWeight: { type: String, default: "" },
    volDiscount: { type: String, default: "" },
    enablePortalPassword: { type: Boolean, default: false },
    portalPasswordSector: { type: String, default: "" },
    upsLabel: { type: Boolean, default: false },
    yadelLabel: { type: Boolean, default: false },
    post11Label: { type: Boolean, default: false },
    dhlLabel: { type: Boolean, default: false },
    upsStandardLabel: { type: Boolean, default: false },
    enableLabelSetting: { type: Boolean, default: false },
    rateHikeService: { type: String, default: "" },
    rateHikeAmount: { type: String, default: "" },
    rateHikeFrom: { type: String, default: "" },
    rateHikeTo: { type: String, default: "" },
    rateHikeTable: { type: Array, default: [] },
    signatureImage: { type: String, default: "" },
    stampImage: { type: String, default: "" },
    bankName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    companyCode: { type: String, default: "" },
    ifsc: { type: String, default: "" },
    bankAddress: { type: String, default: "" },
    selectedBranch: { type: String, default: "" },
    gm: { type: String, default: "" },
    rm: { type: String, default: "" },
    sm: { type: String, default: "" },
    se: { type: String, default: "" },

    //grouping
    groupCode: { type: String, default: "" },
    accountClass: { type: String, default: "" },

    viewInvoicing: {
      type: [
        {
          contactNumber: { type: String, default: "" },
          completeAddress: { type: String, default: "" },
          landmark: { type: String, default: "" },
          pincode: { type: String, default: "" },
          city: { type: String, default: "" },
          state: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    csbSettings: {
      type: [
        {
          exporter: { type: String, default: "" },
          kycNumber: { type: String, default: "" },
          iecCode: { type: String, default: "" },
          gstNumber: { type: String, default: "" },
          adCode: { type: String, default: "" },
          termsOfInvoice: { type: String, default: "" },
          crnNumber: { type: String, default: "" },
          mhbsNumber: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    // In your CustomerAccount schema, update the form16 field:
    // In your CustomerAccount schema
    form16: {
      type: {
        fileName: { type: String, default: "" },
        fileUrl: { type: String, default: "" },
        publicId: { type: String, default: "" }, // Store Cloudinary public ID
        fileSize: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: null },
      },
      default: {
        fileName: "",
        fileUrl: "",
        publicId: "",
        fileSize: 0,
        uploadedAt: null,
      },
    },

    labelLogo: {
      type: {
        logoUrl: { type: String, default: "" },
        uploadedAt: { type: Date, default: null },
      },
      default: {
        logoUrl: "",
        uploadedAt: null,
      },
    },

    // NEW: KYC Verification Fields
    kycVerification: {
      type: {
        status: {
          type: String,
          enum: [
            "not_started",
            "pending",
            "under_review",
            "verified",
            "rejected",
          ],
          default: "not_started",
        },
        method: {
          type: String,
          enum: ["digilocker", "manual"],
          default: null,
        },
        businessType: { type: String, default: "" }, // "Sole Proprietor" or "Company"
        aadharNumber: { type: String, default: "" }, // For DigiLocker verification
        selfieImageUrl: { type: String, default: "" }, // Photo identification
        documents: [
          {
            documentNumber: { type: Number }, // 1 or 2
            documentType: { type: String }, // "Passport", "Driving License", etc.
            frontImageUrl: { type: String },
            backImageUrl: { type: String },
            uploadedAt: { type: Date, default: Date.now },
          },
        ],
        submittedAt: { type: Date, default: null },
        verifiedAt: { type: Date, default: null },
        rejectedAt: { type: Date, default: null },
        rejectionReason: { type: String, default: "" },
        verifiedBy: { type: String, default: "" }, // Admin who verified
      },
      default: {
        status: "not_started",
        method: null,
        businessType: "",
        aadharNumber: "",
        selfieImageUrl: "",
        documents: [],
        submittedAt: null,
        verifiedAt: null,
        rejectedAt: null,
        rejectionReason: "",
        verifiedBy: "",
      },
    },
    notificationPreferences: {
      // Shipment Notifications
      shipmentCreated_email: { type: Boolean, default: true },
      shipmentDelayed_email: { type: Boolean, default: false },
      shipmentStatus_email: { type: Boolean, default: false },
      manifestCreated_email: { type: Boolean, default: false },
      shipmentHold_email: { type: Boolean, default: false },

      shipmentCreated_portal: { type: Boolean, default: true },
      shipmentDelayed_portal: { type: Boolean, default: true },
      shipmentStatus_portal: { type: Boolean, default: true },
      manifestCreated_portal: { type: Boolean, default: true },
      shipmentHold_portal: { type: Boolean, default: true },

      // Billing and Payment Notifications
      newInvoiceGenerated_email: { type: Boolean, default: true },
      paymentDueReminder_email: { type: Boolean, default: false },
      creditLimitExceededAlert_email: { type: Boolean, default: false },
      creditLimitExceededAlert2_email: { type: Boolean, default: false },
      billingError_email: { type: Boolean, default: false },
      rateHike_email: { type: Boolean, default: false },

      newInvoiceGenerated_portal: { type: Boolean, default: true },
      paymentDueReminder_portal: { type: Boolean, default: true },
      creditLimitExceededAlert_portal: { type: Boolean, default: true },
      creditLimitExceededAlert2_portal: { type: Boolean, default: true },
      billingError_portal: { type: Boolean, default: true },
      rateHike_portal: { type: Boolean, default: true },

      // Offers and Updates Notifications
      NewFeatureAnnouncement_email: { type: Boolean, default: true },
      LimiteTimeOffersDiscounts_email: { type: Boolean, default: false },
      PortalMaintenanceAlert_email: { type: Boolean, default: false },
      NewsletterMonthlyDigest_email: { type: Boolean, default: false },
      ServiceUpdates_email: { type: Boolean, default: false },

      NewFeatureAnnouncement_portal: { type: Boolean, default: true },
      LimiteTimeOffersDiscounts_portal: { type: Boolean, default: true },
      PortalMaintenanceAlert_portal: { type: Boolean, default: true },
      NewsletterMonthlyDigest_portal: { type: Boolean, default: true },
      ServiceUpdates_portal: { type: Boolean, default: true },
    },
  },

  { timestamps: true }
);

export default mongoose.models.CustomerAccount ||
  mongoose.model("CustomerAccount", CustomerAccountSchema);
