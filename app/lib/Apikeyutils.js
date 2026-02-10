import crypto from "crypto";

/**
 * Generate a secure random API key
 * Format: prefix_randomstring
 * Example: sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 */
export function generateSecureApiKey(environment = "production") {
  const prefix = environment === "production" ? "sk_live" : "sk_test";
  
  // Generate 32 bytes of random data (256 bits)
  const randomBytes = crypto.randomBytes(32);
  
  // Convert to base62 (alphanumeric) for better readability
  const randomString = randomBytes.toString("base64")
    .replace(/[+/=]/g, "") // Remove special characters
    .substring(0, 40); // Take first 40 characters
  
  return `${prefix}_${randomString}`;
}

/**
 * Hash an API key using SHA-256
 * This is what we store in the database
 */
export function hashApiKey(apiKey) {
  return crypto
    .createHash("sha256")
    .update(apiKey)
    .digest("hex");
}

/**
 * Extract the prefix from an API key (for display/logging)
 * Example: sk_live_abc123... -> sk_live_abc123
 */
export function getKeyPrefix(apiKey) {
  // Return first 16 characters (prefix + first 8 chars of random string)
  return apiKey.substring(0, 16);
}

/**
 * Mask an API key for display purposes
 * Example: sk_live_abc123xyz789 -> sk_live_abc...xyz789
 */
export function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 20) return apiKey;
  
  const parts = apiKey.split("_");
  if (parts.length !== 3) return apiKey;
  
  const prefix = parts[0] + "_" + parts[1]; // sk_live
  const randomPart = parts[2];
  
  const start = randomPart.substring(0, 6);
  const end = randomPart.substring(randomPart.length - 6);
  
  return `${prefix}_${start}...${end}`;
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey) {
  // Check format: sk_live_... or sk_test_...
  const pattern = /^sk_(live|test)_[A-Za-z0-9]{40}$/;
  return pattern.test(apiKey);
}

/**
 * Generate API key with metadata
 */
export function generateApiKeyWithMetadata(customerCode, environment = "production") {
  const apiKey = generateSecureApiKey(environment);
  const hashedKey = hashApiKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);
  
  return {
    plainTextKey: apiKey,        // Send this to customer ONCE
    hashedKey: hashedKey,        // Store this in database
    keyPrefix: keyPrefix,        // Store for identification
    maskedKey: maskApiKey(apiKey), // For display in UI
  };
}

/**
 * Verify a provided API key against stored hash
 */
export function verifyApiKey(providedKey, storedHash) {
  const hashedProvidedKey = hashApiKey(providedKey);
  return hashedProvidedKey === storedHash;
}

export default {
  generateSecureApiKey,
  hashApiKey,
  getKeyPrefix,
  maskApiKey,
  isValidApiKeyFormat,
  generateApiKeyWithMetadata,
  verifyApiKey,
};