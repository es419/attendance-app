import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getGoogleRedirectUri, googleOAuthConfigured } from "@/lib/google-auth";

const STATE_COOKIE = "attendance_oauth_state";

export async function GET(request: Request) {
  if (!googleOAuthConfigured) {
    return NextResponse.redirect(new URL("/?auth=not-configured", request.url));
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const redirectUri = getGoogleRedirectUri(request.url);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ].join(" ")
  );
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
