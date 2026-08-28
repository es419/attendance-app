import { NextResponse } from "next/server";
import { statusForGoogleError, getActiveAttendanceEntry } from "@/lib/google-drive";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "חסר workspaceId" }, { status: 400 });
    const entry = await getActiveAttendanceEntry(workspaceId);
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן לקרוא משמרת פעילה" }, { status: statusForGoogleError(error) });
  }
}
