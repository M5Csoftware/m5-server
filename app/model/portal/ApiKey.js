import mongoose from "mongoose";

const apiKeySchema = new mongoose.Schema(
  {
    // Reference to the API Request
    apiRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "APIRequest",
      required: true,
    },

    // Customer identification
    customerCode: {
      type: String,
      required: true,
      index: true,
    },

    customerName: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
    },

    // Hashed API key (SHA-256)
    hashedKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Key prefix for identification (first 8 chars, not hashed)
    keyPrefix: {
      type: String,
      required: true,
    },

    // Approved API endpoints/use cases
    allowedApis: [{
      name: String,        // e.g., "Track Shipment"
      method: String,      // e.g., "GET"
      endpoint: String,    // e.g., "/v1/track"
    }],

    // Status
    status: {
      type: String,
      enum: ["active", "inactive", "revoked", "expired"],
      default: "active",
    },

    // Rate limiting
    rateLimit: {
      requestsPerHour: {
        type: Number,
        default: 1000,
      },
      requestsPerDay: {
        type: Number,
        default: 10000,
      },
    },

    // Usage tracking
    usage: {
      totalRequests: {
        type: Number,
        default: 0,
      },
      lastUsedAt: {
        type: Date,
      },
      requestsThisHour: {
        type: Number,
        default: 0,
      },
      requestsToday: {
        type: Number,
        default: 0,
      },
      hourlyResetAt: {
        type: Date,
      },
      dailyResetAt: {
        type: Date,
      },
    },

    // Expiration
    expiresAt: {
      type: Date,
      default: null, // null means no expiration
    },

    // Metadata
    createdAt: {
      type: Date,
      default: Date.now,
    },

    approvedBy: {
      type: String, // Admin user who approved
    },

    revokedAt: {
      type: Date,
    },

    revokedBy: {
      type: String,
    },

    revokedReason: {
      type: String,
    },

    // IP whitelist (optional)
    ipWhitelist: [{
      type: String,
    }],

    // Environment
    environment: {
      type: String,
      enum: ["production", "sandbox"],
      default: "production",
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient lookups
apiKeySchema.index({ hashedKey: 1, status: 1 });
apiKeySchema.index({ customerCode: 1, status: 1 });
apiKeySchema.index({ expiresAt: 1 });

// Method to check if key is expired
apiKeySchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Method to check if rate limit exceeded
apiKeySchema.methods.isRateLimitExceeded = function() {
  const now = new Date();
  
  // Reset hourly counter if needed
  if (!this.usage.hourlyResetAt || now > this.usage.hourlyResetAt) {
    this.usage.requestsThisHour = 0;
    this.usage.hourlyResetAt = new Date(now.getTime() + 60 * 60 * 1000);
  }
  
  // Reset daily counter if needed
  if (!this.usage.dailyResetAt || now > this.usage.dailyResetAt) {
    this.usage.requestsToday = 0;
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    this.usage.dailyResetAt = tomorrow;
  }
  
  // Check limits
  if (this.usage.requestsThisHour >= this.rateLimit.requestsPerHour) {
    return { exceeded: true, type: "hourly" };
  }
  
  if (this.usage.requestsToday >= this.rateLimit.requestsPerDay) {
    return { exceeded: true, type: "daily" };
  }
  
  return { exceeded: false };
};

// Method to increment usage
apiKeySchema.methods.incrementUsage = async function() {
  const now = new Date();
  
  this.usage.totalRequests += 1;
  this.usage.requestsThisHour += 1;
  this.usage.requestsToday += 1;
  this.usage.lastUsedAt = now;
  
  await this.save();
};

// Method to check if API endpoint is allowed
apiKeySchema.methods.isEndpointAllowed = function(method, endpoint) {
  return this.allowedApis.some(
    api => api.method.toUpperCase() === method.toUpperCase() && 
           api.endpoint === endpoint
  );
};

const ApiKey = mongoose.models.ApiKey || mongoose.model("ApiKey", apiKeySchema);

export default ApiKey;