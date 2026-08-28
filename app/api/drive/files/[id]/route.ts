import { NextResponse } from "next/server";
import { moveAttendanceFile, renameAttendanceFile, trashAttendanceFile } from "@/lib/google-drive";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    let result: unknown = null;
    if (typeof body.name === "string") result = await renameAttendanceFile(id, body.name);
    if (Array.isArray(body.folderPath)) result = await moveAttendanceFile(id, body.folderPath.map(String));
    if (!result) return NextResponse.json({ error: "לא נשלח שינוי" }, { status: 400 });
    return NextResponse.json({ file: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן לעדכן את הקובץ" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await trashAttendanceFile(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן למחוק את הקובץ" }, { status: 400 });
  }
}
