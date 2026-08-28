import { NextResponse } from "next/server";
import { authCookieName, getStoredGoogleAuth } from "@/lib/google-auth";

export async function POST() {
  const auth = await getStoredGoogleAuth();
  if (auth?.refreshToken) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: auth.refreshToken }),
        cache: "no-store",
      });
    } catch {
      // Clearing the local auth cookie still disconnects this app session.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
