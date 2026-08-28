import { NextResponse } from "next/server";
import { renameAttendanceFile, trashAttendanceFile } from "@/lib/google-drive";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const file = await renameAttendanceFile(id, String(body.name || ""));
    return NextResponse.json({ file });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן לשנות את השם" }, { status: 400 });
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
