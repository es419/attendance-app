import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  authCookieName,
  encryptAuth,
  getGoogleRedirectUri,
  getStoredGoogleAuth,
  googleOAuthConfigured,
} from "@/lib/google-auth";

const STATE_COOKIE = "attendance_oauth_state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!googleOAuthConfigured) return NextResponse.redirect(new URL("/?auth=not-configured", request.url));
  if (url.searchParams.get("error")) return NextResponse.redirect(new URL("/?auth=denied", request.url));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/?auth=invalid-state", request.url));
  }

  const redirectUri = getGoogleRedirectUri(request.url);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    return NextResponse.redirect(new URL("/?auth=token-error", request.url));
  }

  const previous = await getStoredGoogleAuth();
  const refreshToken = tokenData.refresh_token || previous?.refreshToken;
  if (!refreshToken) return NextResponse.redirect(new URL("/?auth=no-refresh-token", request.url));

  let email: string | undefined;
  let name: string | undefined;
  try {
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      cache: "no-store",
    });
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      email = profile.email;
      name = profile.name;
    }
  } catch {
    // Profile data is optional; Drive connection can still succeed.
  }

  const response = NextResponse.redirect(new URL("/?auth=connected", request.url));
  response.cookies.delete(STATE_COOKIE);
  response.cookies.set(
    authCookieName(),
    encryptAuth({ refreshToken, email: email || previous?.email, name: name || previous?.name }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      priority: "high",
    }
  );
  return response;
}
