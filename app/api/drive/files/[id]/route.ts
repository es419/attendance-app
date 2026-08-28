import { NextResponse } from "next/server";
import { moveAttendanceFile, renameAttendanceFile, trashAttendanceFile, updateBreakAllowanceMinutes, updatePayrollSettings } from "@/lib/google-drive";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    let result: unknown = null;
    if (typeof body.name === "string") result = await renameAttendanceFile(id, body.name);
    if (Array.isArray(body.folderPath)) result = await moveAttendanceFile(id, body.folderPath.map(String));
    if (body.breakAllowanceMinutes !== undefined) result = await updateBreakAllowanceMinutes(id, Number(body.breakAllowanceMinutes));
    if (body.payrollSettings && typeof body.payrollSettings === "object") {
      result = await updatePayrollSettings(id, {
        targetHours: Number(body.payrollSettings.targetHours ?? 120),
        hourlyRate: Number(body.payrollSettings.hourlyRate ?? 0),
        pensionPercent: Number(body.payrollSettings.pensionPercent ?? 0),
        trainingFundPercent: Number(body.payrollSettings.trainingFundPercent ?? 0),
        nationalInsuranceHealthPercent: Number(body.payrollSettings.nationalInsuranceHealthPercent ?? 0),
        additions: Array.isArray(body.payrollSettings.additions)
          ? body.payrollSettings.additions.map((item: { id?: unknown; name?: unknown; amount?: unknown }, index: number) => ({
              id: String(item?.id || `addition-${index + 1}`),
              name: String(item?.name || ""),
              amount: Number(item?.amount || 0),
            }))
          : [],
      });
    }
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
