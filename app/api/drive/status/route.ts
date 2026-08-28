import { NextResponse } from "next/server";
import { driveConfigured } from "@/lib/google-drive";
import { getStoredGoogleAuth } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = driveConfigured ? await getStoredGoogleAuth() : null;
  return NextResponse.json(
    {
      configured: driveConfigured,
      connected: Boolean(auth?.refreshToken),
      mode: !driveConfigured ? "not-configured" : auth?.refreshToken ? "google-drive" : "disconnected",
      email: auth?.email,
      name: auth?.name,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
