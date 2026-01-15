import mongoose from 'mongoose';

const TaxSettingSchema = new mongoose.Schema({
  tax: { type: String, required: true },
  taxAmount: { type: Number, required: true },
  effectiveDate: { type: Date, required: true }
});

export default mongoose.models.TaxSetting || mongoose.model('TaxSetting', TaxSettingSchema);
