import { NextResponse } from "next/server";
import { clockOut } from "@/lib/google-drive";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.workspaceId) return NextResponse.json({ error: "חסר קובץ נוכחות" }, { status: 400 });
    const entry = await clockOut(String(body.workspaceId));
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן לבצע יציאה" }, { status: 400 });
  }
}
