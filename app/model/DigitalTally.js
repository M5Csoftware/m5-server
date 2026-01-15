import mongoose from "mongoose";

const DigitalTallySchema = new mongoose.Schema(
  {
    entryType: { type: String },
    client: { type: String, default: null },
    code: { type: String, default: null },

    cdNumber: { type: String, default: null },
    manifestNumber: { type: String, default: null },
    mawbNumber: { type: String, default: null },
    remarks: { type: String, default: null },
    result: { type: String, default: null },

    length: { type: Number, default: null },
    breadth: { type: Number, default: null },
    height: { type: Number, default: null },
    volWeight: { type: Number, default: null },
    actualWeight: { type: Number, default: null },

    email: { type: String, default: null },
    phoneNumber: { type: String, default: null },

    portal: { type: Boolean, default: false },
    eMail: { type: Boolean, default: false },
    whatsApp: { type: Boolean, default: false },

    hold: { type: Boolean, default: false },
    holdReason: { type: String, default: null },

    baggingTable: { type: [mongoose.Schema.Types.Mixed], default: [] },

    inscanUser: { type: String, default: "" },
    inscanUserName: { type: String, default: "" },

    statusDate: String,
    time: String,
    hubCode: String,
    hubName: String,
  },
  {
    timestamps: true,
  }
);

const DigitalTally =
  mongoose.models.DigitalTally ||
  mongoose.model("DigitalTally", DigitalTallySchema);
export default DigitalTally;
