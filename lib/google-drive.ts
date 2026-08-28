import { randomUUID } from "node:crypto";
import { getGoogleAccessToken, googleOAuthConfigured } from "./google-auth";
import type { AttendanceEntry, AttendanceFile, CreateAttendanceFileInput } from "./types";

export const driveConfigured = googleOAuthConfigured;

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4";
const ROOT_FOLDER_NAME = "נוכחות בעבודה";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

export const MONTHS_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

const HEADERS = [
  "מזהה",
  "תאריך",
  "יום",
  "כניסה",
  "יציאה",
  "סה״כ דקות",
  "הערה",
  "כניסה ISO",
  "יציאה ISO",
];

function qEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function googleJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getGoogleAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || `Google API error ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

async function driveList(query: string, fields = "files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents,trashed,appProperties)") {
  const params = new URLSearchParams({
    q: query,
    spaces: "drive",
    pageSize: "100",
    orderBy: "name",
    fields,
  });
  return googleJson<{ files: Array<Record<string, any>> }>(`${DRIVE_API}/files?${params.toString()}`);
}

async function createDriveFile(body: Record<string, unknown>) {
  return googleJson<Record<string, any>>(`${DRIVE_API}/files?fields=id,name,mimeType,createdTime,modifiedTime,webViewLink,parents,appProperties`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function ensureRootFolder() {
  const configuredId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (configuredId) return configuredId;

  const query = `'root' in parents and mimeType='${FOLDER_MIME}' and name='${qEscape(ROOT_FOLDER_NAME)}' and trashed=false`;
  const existing = await driveList(query);
  if (existing.files[0]?.id) return existing.files[0].id as string;

  const created = await createDriveFile({
    name: ROOT_FOLDER_NAME,
    mimeType: FOLDER_MIME,
    parents: ["root"],
    appProperties: { attendanceApp: "root" },
  });
  return created.id as string;
}

type FolderNode = {
  id: string;
  name: string;
  parentId: string;
  path: string[];
  raw: Record<string, any>;
};

async function listChildFolders(parentId: string) {
  const query = `'${qEscape(parentId)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
  return (await driveList(query)).files;
}

async function listFolderTree(rootId: string) {
  const nodes: FolderNode[] = [];
  const queue: Array<{ id: string; path: string[]; depth: number }> = [{ id: rootId, path: [], depth: 0 }];
  const visited = new Set<string>([rootId]);

  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= 8) continue;
    const children = await listChildFolders(current.id);
    for (const child of children) {
      const id = String(child.id || "");
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const path = [...current.path, String(child.name || "")];
      nodes.push({ id, name: String(child.name || ""), parentId: current.id, path, raw: child });
      queue.push({ id, path, depth: current.depth + 1 });
      if (nodes.length > 500) throw new Error("יש יותר מדי תיקיות תחת תיקיית הנוכחות");
    }
  }

  return nodes;
}

async function ensureNamedFolder(parentId: string, name: string, kind: "container" | "subfolder") {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("שם התיקייה לא יכול להיות ריק");
  if (cleanName.length > 80) throw new Error("שם התיקייה ארוך מדי");

  const query = `'${qEscape(parentId)}' in parents and mimeType='${FOLDER_MIME}' and name='${qEscape(cleanName)}' and trashed=false`;
  const existing = await driveList(query);
  if (existing.files[0]?.id) return existing.files[0];

  return createDriveFile({
    name: cleanName,
    mimeType: FOLDER_MIME,
    parents: [parentId],
    appProperties: { attendanceApp: kind },
  });
}

export async function listAttendanceFiles(): Promise<AttendanceFile[]> {
  const rootId = await ensureRootFolder();
  const nodes = await listFolderTree(rootId);
  return nodes
    .filter((node) => node.raw.appProperties?.attendanceApp === "workspace")
    .map((node) => ({
      id: node.id,
      name: node.name,
      folderPath: node.path.slice(0, -1),
      parentId: node.parentId,
      createdTime: node.raw.createdTime,
      modifiedTime: node.raw.modifiedTime,
      webViewLink: node.raw.webViewLink,
    }))
    .sort((a, b) => `${a.folderPath?.join("/") || ""}/${a.name}`.localeCompare(`${b.folderPath?.join("/") || ""}/${b.name}`, "he"));
}

export async function assertAttendanceWorkspace(workspaceId: string) {
  const rootId = await ensureRootFolder();
  const nodes = await listFolderTree(rootId);
  const node = nodes.find((item) => item.id === workspaceId);
  if (!node || node.raw.appProperties?.attendanceApp !== "workspace") {
    throw new Error("תיק הנוכחות לא נמצא בתוך תיקיית האפליקציה");
  }
  return node.raw;
}

export async function createAttendanceFile(input: CreateAttendanceFileInput): Promise<AttendanceFile> {
  const cleanName = input.name.trim();
  const folderName = input.folderName.trim();
  const subfolderName = input.subfolderName?.trim() || "";
  if (!cleanName) throw new Error("צריך לתת שם לקובץ הנוכחות");
  if (!folderName) throw new Error("צריך לתת שם לתיקייה");
  if (cleanName.length > 80 || folderName.length > 80 || subfolderName.length > 80) throw new Error("אחד השמות ארוך מדי");

  const rootId = await ensureRootFolder();
  const folder = await ensureNamedFolder(rootId, folderName, "container");
  let parent = folder;
  const folderPath = [folderName];

  if (subfolderName) {
    parent = await ensureNamedFolder(String(folder.id), subfolderName, "subfolder");
    folderPath.push(subfolderName);
  }

  const duplicateQuery = `'${qEscape(String(parent.id))}' in parents and mimeType='${FOLDER_MIME}' and name='${qEscape(cleanName)}' and trashed=false`;
  const duplicate = await driveList(duplicateQuery);
  if (duplicate.files.some((file) => file.appProperties?.attendanceApp === "workspace")) {
    throw new Error("כבר קיים קובץ נוכחות בשם הזה בתיקייה שנבחרה");
  }

  const created = await createDriveFile({
    name: cleanName,
    mimeType: FOLDER_MIME,
    parents: [String(parent.id)],
    appProperties: { attendanceApp: "workspace" },
  });

  const now = israelNow();
  await ensureYearSpreadsheet(created.id as string, now.year);

  return {
    id: created.id as string,
    name: created.name as string,
    folderPath,
    parentId: String(parent.id),
    createdTime: created.createdTime as string | undefined,
    modifiedTime: created.modifiedTime as string | undefined,
    webViewLink: created.webViewLink as string | undefined,
  };
}

export async function renameAttendanceFile(workspaceId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("צריך לתת שם לקובץ");
  await assertAttendanceWorkspace(workspaceId);
  const updated = await googleJson<Record<string, any>>(
    `${DRIVE_API}/files/${encodeURIComponent(workspaceId)}?fields=id,name,modifiedTime,webViewLink`,
    { method: "PATCH", body: JSON.stringify({ name: cleanName }) }
  );
  return updated;
}

export async function trashAttendanceFile(workspaceId: string) {
  await assertAttendanceWorkspace(workspaceId);
  await googleJson(`${DRIVE_API}/files/${encodeURIComponent(workspaceId)}?fields=id,trashed`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true }),
  });
}

async function findYearSpreadsheet(workspaceId: string, year: number) {
  const base = `'${qEscape(workspaceId)}' in parents and mimeType='${SHEET_MIME}' and trashed=false`;
  const marked = await driveList(`${base} and appProperties has { key='attendanceYear' and value='${year}' }`);
  if (marked.files[0]?.id) return { file: marked.files[0], needsInit: false };

  const named = await driveList(`${base} and (name='${year}' or name='נוכחות ${year}')`);
  if (named.files[0]?.id) return { file: named.files[0], needsInit: true };
  return null;
}

async function sheetsMetadata(spreadsheetId: string) {
  return googleJson<{
    properties?: { title?: string; locale?: string; timeZone?: string };
    sheets?: Array<{ properties: { sheetId: number; title: string; index: number } }>;
  }>(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties,sheets.properties`);
}

async function sheetsBatchUpdate(spreadsheetId: string, requests: Record<string, unknown>[]) {
  return googleJson(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

async function getValues(spreadsheetId: string, a1: string) {
  return googleJson<{ range?: string; values?: string[][] }>(
    `${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1)}?majorDimension=ROWS`
  );
}

async function updateValues(spreadsheetId: string, range: string, values: unknown[][]) {
  return googleJson(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

async function appendValues(spreadsheetId: string, range: string, values: unknown[][]) {
  return googleJson(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

async function batchUpdateValues(spreadsheetId: string, data: Array<{ range: string; values: unknown[][] }>) {
  return googleJson(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
}

async function initializeAttendanceSpreadsheet(spreadsheetId: string, isNew: boolean) {
  const metadata = await sheetsMetadata(spreadsheetId);
  const currentSheets = metadata.sheets || [];
  const titles = new Set(currentSheets.map((s) => s.properties.title));
  const requests: Record<string, unknown>[] = [];

  requests.push({
    updateSpreadsheetProperties: {
      properties: { locale: "iw_IL", timeZone: "Asia/Jerusalem" },
      fields: "locale,timeZone",
    },
  });

  if (isNew && currentSheets.length === 1 && currentSheets[0].properties.title === "Sheet1") {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: currentSheets[0].properties.sheetId, title: MONTHS_HE[0], rightToLeft: true, gridProperties: { frozenRowCount: 1 } },
        fields: "title,rightToLeft,gridProperties.frozenRowCount",
      },
    });
    titles.delete("Sheet1");
    titles.add(MONTHS_HE[0]);
  }

  for (const month of MONTHS_HE) {
    if (!titles.has(month)) {
      requests.push({ addSheet: { properties: { title: month, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } } });
    }
  }

  if (requests.length) await sheetsBatchUpdate(spreadsheetId, requests);

  for (const month of MONTHS_HE) {
    const row1 = await getValues(spreadsheetId, `'${month}'!A1:I1`);
    const first = row1.values?.[0] || [];
    if (first.every((value) => !value)) {
      await updateValues(spreadsheetId, `'${month}'!A1:I1`, [HEADERS]);
    }
  }
}

export async function ensureYearSpreadsheet(workspaceId: string, year: number) {
  await assertAttendanceWorkspace(workspaceId);
  const existing = await findYearSpreadsheet(workspaceId, year);
  if (existing?.file?.id) {
    const id = existing.file.id as string;
    if (existing.needsInit) {
      await initializeAttendanceSpreadsheet(id, false);
      await googleJson(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=id,appProperties`, {
        method: "PATCH",
        body: JSON.stringify({ appProperties: { attendanceApp: "year", attendanceYear: String(year) } }),
      });
    }
    return id;
  }

  const created = await createDriveFile({
    name: `נוכחות ${year}`,
    mimeType: SHEET_MIME,
    parents: [workspaceId],
    appProperties: { attendanceApp: "year", attendanceYear: String(year) },
  });
  const id = created.id as string;
  await initializeAttendanceSpreadsheet(id, true);
  return id;
}

export function israelNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = get("hour");
  const minute = get("minute");
  return {
    year,
    month,
    day,
    dateDisplay: `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`,
    timeDisplay: `${hour}:${minute}`,
    weekday: new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long" }).format(date),
    iso: date.toISOString(),
  };
}

function rowToEntry(row: string[]): AttendanceEntry {
  return {
    id: row[0] || "",
    date: row[1] || "",
    weekday: row[2] || "",
    clockIn: row[3] || "",
    clockOut: row[4] || undefined,
    durationMinutes: Number(row[5] || 0),
    clockInIso: row[7] || undefined,
    clockOutIso: row[8] || undefined,
  };
}

async function readMonthRows(workspaceId: string, year: number, month: number, createIfMissing = true) {
  let spreadsheetId: string | null = null;
  if (createIfMissing) {
    spreadsheetId = await ensureYearSpreadsheet(workspaceId, year);
  } else {
    const existing = await findYearSpreadsheet(workspaceId, year);
    spreadsheetId = existing?.file?.id ? String(existing.file.id) : null;
  }
  if (!spreadsheetId) return null;

  const sheetName = MONTHS_HE[month - 1];
  const response = await getValues(spreadsheetId, `'${sheetName}'!A2:I1000`);
  const rows = (response.values || []).map((row, index) => ({
    rowNumber: index + 2,
    raw: row,
    entry: rowToEntry(row),
  }));
  return { spreadsheetId, sheetName, rows };
}

export async function getAttendanceEntries(workspaceId: string, year: number, month: number) {
  await assertAttendanceWorkspace(workspaceId);
  const current = await readMonthRows(workspaceId, year, month, true);
  if (!current) return [];
  return current.rows
    .filter((row) => row.entry.id)
    .map((row) => row.entry)
    .reverse();
}

async function findOpenEntry(workspaceId: string, now = new Date()) {
  const current = israelNow(now);
  const candidates: Array<{ year: number; month: number }> = [{ year: current.year, month: current.month }];
  if (current.month === 1) candidates.push({ year: current.year - 1, month: 12 });
  else candidates.push({ year: current.year, month: current.month - 1 });

  for (const candidate of candidates) {
    const monthData = await readMonthRows(workspaceId, candidate.year, candidate.month, false);
    if (!monthData) continue;
    for (let i = monthData.rows.length - 1; i >= 0; i--) {
      const row = monthData.rows[i];
      if (row.entry.id && !row.entry.clockOut && row.entry.clockInIso) {
        return { ...monthData, ...row };
      }
    }
  }
  return null;
}

export async function clockIn(workspaceId: string) {
  await assertAttendanceWorkspace(workspaceId);
  const existing = await findOpenEntry(workspaceId);
  if (existing) throw new Error("כבר קיימת כניסה פתוחה");

  const now = new Date();
  const local = israelNow(now);
  const spreadsheetId = await ensureYearSpreadsheet(workspaceId, local.year);
  const sheetName = MONTHS_HE[local.month - 1];
  const id = randomUUID();
  const row = [id, local.dateDisplay, local.weekday, local.timeDisplay, "", 0, "", local.iso, ""];
  await appendValues(spreadsheetId, `'${sheetName}'!A:I`, [row]);
  return rowToEntry(row.map(String));
}

export async function clockOut(workspaceId: string) {
  await assertAttendanceWorkspace(workspaceId);
  const open = await findOpenEntry(workspaceId);
  if (!open) throw new Error("אין כניסה פתוחה לסגירה");

  const now = new Date();
  const local = israelNow(now);
  const startMs = Date.parse(open.entry.clockInIso!);
  const durationMinutes = Math.max(1, Math.floor((now.getTime() - startMs) / 60000));

  await batchUpdateValues(open.spreadsheetId, [
    { range: `'${open.sheetName}'!E${open.rowNumber}`, values: [[local.timeDisplay]] },
    { range: `'${open.sheetName}'!F${open.rowNumber}`, values: [[durationMinutes]] },
    { range: `'${open.sheetName}'!I${open.rowNumber}`, values: [[local.iso]] },
  ]);

  return {
    ...open.entry,
    clockOut: local.timeDisplay,
    clockOutIso: local.iso,
    durationMinutes,
  } satisfies AttendanceEntry;
}
