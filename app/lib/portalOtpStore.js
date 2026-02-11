// app/lib/portalOtpStore.js
// Shared OTP storage across API routes using global singleton
// NOTE: In production, replace this with Redis or database storage

class OTPStore {
  constructor() {
    this.store = new Map();
    console.log("🏗️ OTPStore instance created");
  }

  set(email, data) {
    const emailLower = email.toLowerCase();
    const storeData = {
      ...data,
      createdAt: Date.now(),
    };
    
    this.store.set(emailLower, storeData);
    console.log(`✓ OTP stored for ${emailLower}:`, { 
      otp: storeData.otp, 
      expiresAt: new Date(storeData.expiresAt).toISOString(),
      verified: storeData.verified || false,
      totalStored: this.store.size
    });
    
    return storeData;
  }

  get(email) {
    const emailLower = email.toLowerCase();
    const data = this.store.get(emailLower);
    
    if (data) {
      console.log(`✓ OTP retrieved for ${emailLower}:`, {
        exists: true,
        otp: data.otp,
        verified: data.verified || false,
        expired: Date.now() > data.expiresAt,
        attempts: data.attempts || 0,
        totalStored: this.store.size
      });
    } else {
      console.log(`✗ No OTP found for ${emailLower}. Total stored: ${this.store.size}`);
      console.log(`Available emails:`, Array.from(this.store.keys()));
    }
    
    return data;
  }

  delete(email) {
    const emailLower = email.toLowerCase();
    const deleted = this.store.delete(emailLower);
    console.log(`${deleted ? '✓' : '✗'} OTP deleted for ${emailLower}. Remaining: ${this.store.size}`);
    return deleted;
  }

  // Check if OTP exists and is verified
  isVerified(email) {
    const data = this.get(email);
    return data && data.verified === true;
  }

  // Increment attempt count
  incrementAttempts(email) {
    const emailLower = email.toLowerCase();
    const data = this.store.get(emailLower);
    if (data) {
      data.attempts = (data.attempts || 0) + 1;
      this.store.set(emailLower, data);
      console.log(`⚠️ Attempt ${data.attempts} for ${emailLower}`);
    }
    return data?.attempts || 0;
  }

  // Clean up expired OTPs (run periodically)
  cleanExpired() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [email, data] of this.store.entries()) {
      if (data.expiresAt < now) {
        this.store.delete(email);
        cleanedCount++;
        console.log(`🧹 Expired OTP removed for ${email}`);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired OTP(s). Remaining: ${this.store.size}`);
    }
    
    return cleanedCount;
  }

  // Get all stored emails (for debugging)
  getAllEmails() {
    return Array.from(this.store.keys());
  }

  // Get store size
  getSize() {
    return this.store.size;
  }

  // Clear all OTPs (for debugging/testing)
  clearAll() {
    const count = this.store.size;
    this.store.clear();
    console.log(`🧹 Cleared all ${count} OTP(s)`);
  }

  // Get OTP info without logging
  getInfo(email) {
    const emailLower = email.toLowerCase();
    const data = this.store.get(emailLower);
    if (!data) return null;
    
    return {
      otp: data.otp,
      expiresAt: data.expiresAt,
      verified: data.verified,
      attempts: data.attempts || 0,
      createdAt: data.createdAt,
      expiresIn: data.expiresAt - Date.now()
    };
  }
}

// Use global to ensure singleton across hot-reloads in Next.js
if (!global.portalOtpStoreInstance) {
  global.portalOtpStoreInstance = new OTPStore();
  console.log("🔐 Global Portal OTPStore initialized");
}

const otpStore = global.portalOtpStoreInstance;

// Clean up expired OTPs every 5 minutes (only in server environment)
if (typeof setInterval !== 'undefined' && !global.portalOtpCleanupInterval) {
  global.portalOtpCleanupInterval = setInterval(() => {
    otpStore.cleanExpired();
  }, 5 * 60 * 1000); // 5 minutes
  console.log("⏰ Portal OTP cleanup interval started");
}

export default otpStore;