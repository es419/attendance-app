import crypto from "node:crypto";
import { cookies } from "next/headers";

const AUTH_COOKIE = "attendance_google_auth";

export const googleOAuthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.AUTH_SECRET
);

export type StoredGoogleAuth = {
  refreshToken: string;
  email?: string;
  name?: string;
};

function getKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptAuth(value: StoredGoogleAuth) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptAuth(value?: string | null): StoredGoogleAuth | null {
  if (!value) return null;
  try {
    const payload = Buffer.from(value, "base64url");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as StoredGoogleAuth;
  } catch {
    return null;
  }
}

export async function getStoredGoogleAuth() {
  if (!googleOAuthConfigured) return null;
  const store = await cookies();
  return decryptAuth(store.get(AUTH_COOKIE)?.value);
}

export function authCookieName() {
  return AUTH_COOKIE;
}

type CachedAccessToken = { token: string; expiresAt: number };
const accessTokenCache = new Map<string, CachedAccessToken>();

function accessTokenCacheKey(refreshToken: string) {
  return crypto.createHash("sha256").update(refreshToken).digest("hex").slice(0, 24);
}

export async function getGoogleAccessToken(forceRefresh = false) {
  if (!googleOAuthConfigured) throw new Error("Google OAuth is not configured");

  const auth = await getStoredGoogleAuth();
  if (!auth?.refreshToken) throw new Error("Google Drive is not connected");

  const cacheKey = accessTokenCacheKey(auth.refreshToken);
  const cached = accessTokenCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt - Date.now() > 60_000) return cached.token;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: auth.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("החיבור ל-Google ארך יותר מדי זמן. נסה שוב");
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    accessTokenCache.delete(cacheKey);
    throw new Error(data.error_description || "Could not refresh Google access token");
  }
  const token = data.access_token as string;
  const expiresInMs = Math.max(60, Number(data.expires_in || 3600)) * 1000;
  accessTokenCache.set(cacheKey, { token, expiresAt: Date.now() + expiresInMs });
  return token;
}

export function getGoogleRedirectUri(requestUrl: string) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const url = new URL(requestUrl);
  return `${url.origin}/api/auth/google/callback`;
}
