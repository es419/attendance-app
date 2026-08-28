import { NextResponse } from "next/server";
import { statusForGoogleError, addManualShift } from "@/lib/google-drive";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.workspaceId) return NextResponse.json({ error: "חסר קובץ נוכחות" }, { status: 400 });
    if (!body.date || !body.clockIn || !body.clockOut) {
      return NextResponse.json({ error: "חסרים תאריך, שעת התחלה או שעת סיום" }, { status: 400 });
    }
    const entry = await addManualShift(String(body.workspaceId), {
      date: String(body.date),
      clockIn: String(body.clockIn),
      clockOut: String(body.clockOut),
      breakMinutes: Number(body.breakMinutes || 0),
      note: body.note ? String(body.note) : "",
      entryId: body.entryId ? String(body.entryId) : undefined,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן להוסיף משמרת ידנית" }, { status: statusForGoogleError(error) });
  }
}
