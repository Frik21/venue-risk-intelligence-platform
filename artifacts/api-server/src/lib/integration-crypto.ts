import crypto from "crypto";

// Application-layer encryption for subscriber-supplied third-party API
// keys (Integrations, routes/integrations.ts) - same connect-later
// posture as every other secret-adjacent feature in this app
// (lib/stripe.ts, lib/sms.ts): real AES-256-GCM wiring, gated on a new
// INTEGRATION_ENCRYPTION_KEY env var that isn't set anywhere in this
// environment yet, deliberately NOT a fail-fast startup check like
// DATABASE_URL/SESSION_SECRET - a company simply can't save a new
// integration's key until it's set, same "degrades instead of refusing
// to boot" shape Stripe/SMS/email already follow.
//
// Uses Node's own built-in crypto module (already a dependency -
// lib/auth.ts's session/token generation already uses it), not a new
// npm package - a single symmetric cipher doesn't need one.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the recommended size for GCM

function getKey(): Buffer | null {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) return null;
  // Accept either a 64-char hex string or any string, hashed down to a
  // stable 32-byte key either way - so the env var can be a plain
  // human-typed secret rather than requiring a pre-formatted hex key.
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
}

export function isIntegrationEncryptionConfigured(): boolean {
  return getKey() !== null;
}

// ciphertext is stored as "<iv-hex>:<authTag-hex>:<encrypted-hex>" - a
// single text column, no separate columns for the IV/tag.
export function encryptApiKey(plaintext: string): string {
  const key = getKey();
  if (!key) throw new Error("Integration encryption is not configured yet");

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptApiKey(ciphertext: string): string {
  const key = getKey();
  if (!key) throw new Error("Integration encryption is not configured yet");

  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error("Malformed integration ciphertext");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function lastFourOf(apiKey: string): string {
  return apiKey.length <= 4 ? apiKey : apiKey.slice(-4);
}
