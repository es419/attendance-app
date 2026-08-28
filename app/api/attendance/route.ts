import { NextResponse } from "next/server";
import { getAttendanceEntries, israelNow } from "@/lib/google-drive";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "חסר workspaceId" }, { status: 400 });

    const now = israelNow();
    const year = Number(url.searchParams.get("year") || now.year);
    const month = Number(url.searchParams.get("month") || now.month);
    if (!Number.isInteger(year) || month < 1 || month > 12) {
      return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });
    }

    const entries = await getAttendanceEntries(workspaceId, year, month);
    return NextResponse.json({ entries, year, month });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן לקרוא רשומות" }, { status: 400 });
  }
}
