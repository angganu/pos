/**
 * Session constants shared by the proxy (src/proxy.ts) and the server.
 */
export const SESSION_COOKIE = "pos_session";
export const JWT_ALG = "HS256";

const DEV_FALLBACK = "insecure-dev-secret-change-me-not-for-production";
let cached: Uint8Array | null = null;

/**
 * The JWT signing key. Resolved lazily so `next build` never needs it, and
 * fails closed in production: a missing or weak AUTH_SECRET would let anyone
 * forge a session cookie for any user.
 */
export function authSecret(): Uint8Array {
  if (cached) return cached;

  const raw = process.env.AUTH_SECRET ?? "";
  if (raw.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set to at least 32 random characters.");
    }
    console.warn("[auth] AUTH_SECRET is missing or shorter than 32 chars — using an insecure dev key.");
  }

  cached = new TextEncoder().encode(raw.length >= 32 ? raw : DEV_FALLBACK);
  return cached;
}
