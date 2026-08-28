import { NextResponse } from "next/server";
import { deleteAttendanceEntry, updateAttendanceEntry } from "@/lib/google-drive";

function locationFrom(body: Record<string, unknown>) {
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("מיקום הרשומה לא תקין");
  return { year, month };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (!body.workspaceId) return NextResponse.json({ error: "חסר קובץ נוכחות" }, { status: 400 });
    if (!body.date || !body.clockIn) return NextResponse.json({ error: "חסרים תאריך או שעת כניסה" }, { status: 400 });
    const entry = await updateAttendanceEntry(String(body.workspaceId), id, locationFrom(body), {
      date: String(body.date),
      clockIn: String(body.clockIn),
      clockOut: body.clockOut ? String(body.clockOut) : undefined,
      breakMinutes: Number(body.breakMinutes || 0),
      note: body.note ? String(body.note) : "",
    });
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן לערוך רשומה" }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const year = Number(url.searchParams.get("year"));
    const month = Number(url.searchParams.get("month"));
    if (!workspaceId || !Number.isInteger(year) || !Number.isInteger(month)) return NextResponse.json({ error: "חסרים פרטי הרשומה" }, { status: 400 });
    await deleteAttendanceEntry(workspaceId, id, { year, month });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן למחוק רשומה" }, { status: 400 });
  }
}
