import { NextResponse } from "next/server";
import { adoptDriveSpreadsheet, listAdoptableDriveSpreadsheets } from "@/lib/google-drive";

export async function GET() {
  try {
    return NextResponse.json({ files: await listAdoptableDriveSpreadsheets() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן לקרוא קבצי Google Sheets מ-Drive" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "חסר מזהה קובץ" }, { status: 400 });

    const result = await adoptDriveSpreadsheet(id, {
      confirmOverwrite: Boolean(body.confirmOverwrite),
      workspaceName: body.workspaceName ? String(body.workspaceName) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן להשתמש בקובץ שנבחר" },
      { status: 400 }
    );
  }
}
