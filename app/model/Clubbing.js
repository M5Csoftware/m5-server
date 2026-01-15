import mongoose from "mongoose";

const clubbingSchema = new mongoose.Schema({
  runNo: { type: String },
  clubNo: { type: String },
  date: { type: Date },
  service: { type: String },
  remarks: { type: String },
  isLocked: { type: Boolean, default: false},

  // Store all AWBs here
  rowData: [
    {
      awbNo: { type: String, required: true },
      weight: { type: String, required: true },
      bagWeight: { type: String },
      clubNo: { type: String },
    },
  ],
});

const Clubbing =
  mongoose.models.Clubbing || mongoose.model("Clubbing", clubbingSchema);

export default Clubbing;
