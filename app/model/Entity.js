// app/model/Entity.js
import mongoose from "mongoose";

const EntitySchema = new mongoose.Schema({
  entityType: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  sector: {
    type: String,
    default: "",
  },
  activeOnPortal: {
    type: Boolean,
    default: false,
  },
  activeOnSoftware: {
    type: Boolean,
    default: false,
  },
  hsn: {
    type: String,
    default: "",
  },
  taxCharges: {
    type: Boolean,
    default: false,
  },

  fuelCharges: {
    type: Boolean,
    default: false,
  },
});

const Entity = mongoose.models.Entity || mongoose.model("Entity", EntitySchema);

export default Entity;
