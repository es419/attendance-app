import { NextResponse } from "next/server";
import { driveConfigured } from "@/lib/google-drive";

export async function GET() {
  return NextResponse.json({
    configured: driveConfigured,
    mode: driveConfigured ? "google-drive" : "mock",
  });
}
