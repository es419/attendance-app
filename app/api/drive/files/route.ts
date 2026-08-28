import { NextResponse } from "next/server";
import { statusForGoogleError, createAttendanceFile, listAttendanceFiles } from "@/lib/google-drive";

export async function GET() {
  try {
    return NextResponse.json({ files: await listAttendanceFiles() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "שגיאה ב-Google Drive" }, { status: statusForGoogleError(error, 401) });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const file = await createAttendanceFile({
      name: String(body.name || ""),
      folderName: String(body.folderName || ""),
      subfolderName: body.subfolderName ? String(body.subfolderName) : undefined,
    });
    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "לא ניתן ליצור קובץ" }, { status: statusForGoogleError(error) });
  }
}
