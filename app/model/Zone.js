// import mongoose from 'mongoose';

// const zoneSchema = new mongoose.Schema(
//   {
//     zoneMatrix: { type: String, required: true }, // To store zone matrix data
//     service: { type: String, required: true }, // To store the service type
//     sector: { type: String, required: true }, // To store the sector name
//     zone: { type: String, required: true }, // To store the zone name
//     destination: { type: String, required: true }, // To store destination info
//     zipcode: { type: String, required: false }, // To store the zipcode
//     effectiveDateFrom: { type: Date, required: false }, // Effective start date
//     effectiveDateTo: { type: Date, required: false }, // Effective end date (optional)
//     remoteZones: [{ type: String, required: false }], // Remote zones, can store multiple
//     unserviceableZones: [{ type: String, required: false }], // Unserviceable zones, can store multiple
//      form: {type: Date, required: false},
//      to: {type: Date, required: false}                                                       
//   },
//   { timestamps: true }
// );

// // Create or fetch the 'Zone' model
// const Zone = mongoose.models.Zone || mongoose.model('Zone', zoneSchema);

// export default Zone;

import mongoose from 'mongoose';

const zoneSchema = new mongoose.Schema(
  {
    zoneMatrix: { 
      type: String, 
      required: true,
      trim: true,
      index: true // Index for faster queries
    },
    service: { 
      type: String, 
      required: true,
      trim: true,
      index: true
    },
    sector: { 
      type: String, 
      required: true,
      trim: true,
      index: true
    },
    zone: { 
      type: String, 
      required: true,
      trim: true,
      index: true
    },
    destination: { 
      type: String, 
      required: true,
      trim: true,
      index: true
    },
    zipcode: { 
      type: String, 
      required: false,
      trim: true,
      default: ''
    },
    effectiveDateFrom: { 
      type: Date, 
      required: false,
      index: true
    },
    effectiveDateTo: { 
      type: Date, 
      required: false,
      index: true
    },
    remoteZones: [{ 
      type: String, 
      trim: true 
    }],
    unserviceableZones: [{ 
      type: String, 
      trim: true 
    }],
    // Additional metadata fields
    uploadDate: { 
      type: Date, 
      default: Date.now 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    }
  },
  { 
    timestamps: true, // Adds createdAt and updatedAt automatically
    collection: 'zones' // Explicit collection name
  }
);

// Compound index for common queries
zoneSchema.index({ sector: 1, zone: 1, service: 1 });
zoneSchema.index({ zoneMatrix: 1, sector: 1 });
zoneSchema.index({ effectiveDateFrom: 1, effectiveDateTo: 1 });

// Virtual to check if zone is currently effective
zoneSchema.virtual('isEffective').get(function() {
  const now = new Date();
  const fromDate = this.effectiveDateFrom ? new Date(this.effectiveDateFrom) : null;
  const toDate = this.effectiveDateTo ? new Date(this.effectiveDateTo) : null;
  
  if (!fromDate && !toDate) return true; // No date restrictions
  if (fromDate && !toDate) return now >= fromDate; // Only start date
  if (!fromDate && toDate) return now <= toDate; // Only end date
  return now >= fromDate && now <= toDate; // Both dates
});

// Instance method to check if a zone is remote
zoneSchema.methods.isRemoteZone = function(zoneNumber) {
  return this.remoteZones.includes(zoneNumber);
};

// Instance method to check if a zone is unserviceable
zoneSchema.methods.isUnserviceableZone = function(zoneNumber) {
  return this.unserviceableZones.includes(zoneNumber);
};

// Static method to find zones by sector and service
zoneSchema.statics.findBySectorAndService = function(sector, service) {
  return this.find({ sector, service, isActive: true });
};

// Static method to find effective zones
zoneSchema.statics.findEffectiveZones = function(date = new Date()) {
  return this.find({
    isActive: true,
    $or: [
      { effectiveDateFrom: null, effectiveDateTo: null },
      { effectiveDateFrom: { $lte: date }, effectiveDateTo: null },
      { effectiveDateFrom: null, effectiveDateTo: { $gte: date } },
      { effectiveDateFrom: { $lte: date }, effectiveDateTo: { $gte: date } }
    ]
  });
};

// Pre-save hook to trim strings
zoneSchema.pre('save', function(next) {
  if (this.isModified('zoneMatrix')) this.zoneMatrix = this.zoneMatrix.trim();
  if (this.isModified('service')) this.service = this.service.trim();
  if (this.isModified('sector')) this.sector = this.sector.trim();
  if (this.isModified('zone')) this.zone = this.zone.trim();
  if (this.isModified('destination')) this.destination = this.destination.trim();
  if (this.isModified('zipcode') && this.zipcode) this.zipcode = this.zipcode.trim();
  next();
});

// Create or fetch the 'Zone' model
const Zone = mongoose.models.Zone || mongoose.model('Zone', zoneSchema);

export default Zone;