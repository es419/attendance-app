import { NextResponse } from "next/server";
import { statusForGoogleError, clockOut } from "@/lib/google-drive";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.workspaceId) return NextResponse.json({ error: "חסר קובץ נוכחות" }, { status: 400 });
    const entry = await clockOut(String(body.workspaceId), {
      atIso: body.atIso ? String(body.atIso) : undefined,
      entryId: body.entryId ? String(body.entryId) : undefined,
      year: body.year ? Number(body.year) : undefined,
      month: body.month ? Number(body.month) : undefined,
    });
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן לבצע יציאה" }, { status: statusForGoogleError(error) });
  }
}
