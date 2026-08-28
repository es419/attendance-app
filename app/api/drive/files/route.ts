import { NextResponse } from "next/server";
import { createAttendanceFile, listAttendanceFiles } from "@/lib/google-drive";

export async function GET() {
  try {
    return NextResponse.json({ files: await listAttendanceFiles() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "שגיאה ב-Google Drive" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const file = await createAttendanceFile(String(body.name || ""));
    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן ליצור קובץ" }, { status: 400 });
  }
}
