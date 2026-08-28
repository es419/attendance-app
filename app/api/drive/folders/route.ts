import { NextResponse } from "next/server";
import { createAttendanceFolder, listAttendanceFolders, renameAttendanceFolder, trashAttendanceFolder } from "@/lib/google-drive";

export async function GET() {
  try {
    return NextResponse.json({ folders: await listAttendanceFolders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן לקרוא תיקיות" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.path)) return NextResponse.json({ error: "חסר נתיב" }, { status: 400 });
    const folder = await createAttendanceFolder(body.path.map(String));
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן ליצור תיקייה" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!body.id || !body.name) return NextResponse.json({ error: "חסרים מזהה או שם" }, { status: 400 });
    const folder = await renameAttendanceFolder(String(body.id), String(body.name));
    return NextResponse.json({ folder });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן לשנות שם תיקייה" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר מזהה תיקייה" }, { status: 400 });
    await trashAttendanceFolder(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן למחוק תיקייה" }, { status: 400 });
  }
}
