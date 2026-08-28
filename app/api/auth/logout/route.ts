import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/google-auth";

export async function POST() {
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
