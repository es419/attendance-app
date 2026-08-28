import { randomUUID } from "node:crypto";
import { getGoogleAccessToken, googleOAuthConfigured } from "./google-auth";
import type {
  AttendanceBreak,
  AttendanceEntry,
  AttendanceFile,
  CreateAttendanceFileInput,
  DriveFolder,
} from "./types";

export const driveConfigured = googleOAuthConfigured;

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4";
const ROOT_FOLDER_NAME = "נוכחות בעבודה";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const SCHEMA_VERSION = "3";

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
  "דקות לחיוב",
  "הערה",
  "כניסה ISO",
  "יציאה ISO",
  "הפסקות JSON",
  "דקות הפסקה",
  "דקות ברוטו",
  "מקור",
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

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
};

const DRIVE_FIELDS = "id,name,mimeType,createdTime,modifiedTime,webViewLink,parents,trashed,appProperties";

async function driveList(query: string, orderBy = "name") {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: query,
      spaces: "drive",
      pageSize: "1000",
      orderBy,
      fields: `nextPageToken,files(${DRIVE_FIELDS})`,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await googleJson<{ files?: DriveFile[]; nextPageToken?: string }>(`${DRIVE_API}/files?${params.toString()}`);
    files.push(...(page.files || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return { files };
}

async function getDriveFile(id: string) {
  return googleJson<DriveFile>(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(DRIVE_FIELDS)}`);
}

async function createDriveFile(body: Record<string, unknown>) {
  return googleJson<DriveFile>(`${DRIVE_API}/files?fields=${encodeURIComponent(DRIVE_FIELDS)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function patchDriveFile(id: string, body: Record<string, unknown>, params?: Record<string, string>) {
  const query = new URLSearchParams({ fields: DRIVE_FIELDS, ...(params || {}) });
  return googleJson<DriveFile>(`${DRIVE_API}/files/${encodeURIComponent(id)}?${query.toString()}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function managedProps(kind: "root" | "folder" | "workspace" | "year", extra: Record<string, string> = {}) {
  return { attendanceApp: kind, attendanceSchema: SCHEMA_VERSION, ...extra };
}

export async function ensureRootFolder() {
  const configuredId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (configuredId) return configuredId;

  const marked = await driveList(`mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='attendanceApp' and value='root' }`, "createdTime");
  if (marked.files[0]?.id) {
    const root = marked.files[0];
    if (root.appProperties?.attendanceSchema !== SCHEMA_VERSION) {
      await patchDriveFile(root.id, { appProperties: managedProps("root") });
    }
    return root.id;
  }

  const named = await driveList(`'root' in parents and mimeType='${FOLDER_MIME}' and name='${qEscape(ROOT_FOLDER_NAME)}' and trashed=false`, "createdTime");
  if (named.files[0]?.id) {
    await patchDriveFile(named.files[0].id, { appProperties: managedProps("root") });
    return named.files[0].id;
  }

  const created = await createDriveFile({
    name: ROOT_FOLDER_NAME,
    mimeType: FOLDER_MIME,
    parents: ["root"],
    appProperties: managedProps("root"),
  });
  return created.id;
}

async function resolveParentPath(parentId: string | undefined, appRootId: string) {
  if (!parentId) return { path: [] as string[], insideRoot: false };
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = parentId;
  let insideRoot = false;

  for (let depth = 0; currentId && depth < 20; depth++) {
    if (currentId === appRootId) {
      insideRoot = true;
      break;
    }
    if (currentId === "root" || visited.has(currentId)) break;
    visited.add(currentId);
    try {
      const item = await getDriveFile(currentId);
      if (item.trashed) break;
      if (item.name && item.name !== "My Drive") path.unshift(item.name);
      currentId = item.parents?.[0];
    } catch {
      break;
    }
  }
  return { path, insideRoot };
}

async function ensureWorkspaceMetadata(file: DriveFile) {
  const workspaceKey = file.appProperties?.workspaceKey || randomUUID();
  const desired = managedProps("workspace", { workspaceKey });
  const props = file.appProperties || {};
  if (props.attendanceSchema !== SCHEMA_VERSION || props.workspaceKey !== workspaceKey || props.attendanceApp !== "workspace") {
    return patchDriveFile(file.id, { appProperties: { ...props, ...desired } });
  }
  return file;
}

async function listGlobalWorkspaces() {
  const result = await driveList(`mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='attendanceApp' and value='workspace' }`, "modifiedTime desc");
  return result.files;
}

async function repairYearSheetsForWorkspace(workspace: DriveFile) {
  const workspaceKey = workspace.appProperties?.workspaceKey || "";
  const childSheets = await driveList(`'${qEscape(workspace.id)}' in parents and mimeType='${SHEET_MIME}' and trashed=false`);
  for (const sheet of childSheets.files) {
    const props = sheet.appProperties || {};
    const yearFromProp = Number(props.attendanceYear || 0);
    const yearFromName = Number(/(?:^|\s)(20\d{2})(?:$|\s)/.exec(sheet.name || "")?.[1] || 0);
    const year = yearFromProp || yearFromName;
    const looksManaged = props.attendanceApp === "year" || Boolean(year);
    if (!looksManaged || !year) continue;
    const desired = managedProps("year", {
      attendanceYear: String(year),
      attendanceWorkspaceId: workspace.id,
      workspaceKey,
    });
    if (
      props.attendanceSchema !== SCHEMA_VERSION ||
      props.attendanceApp !== "year" ||
      props.attendanceWorkspaceId !== workspace.id ||
      props.workspaceKey !== workspaceKey
    ) {
      await patchDriveFile(sheet.id, { appProperties: { ...props, ...desired } });
    }
  }
}

export async function reconcileDrive() {
  const rootId = await ensureRootFolder();
  const rawWorkspaces = await listGlobalWorkspaces();
  const repaired: DriveFile[] = [];
  for (const raw of rawWorkspaces) {
    const workspace = await ensureWorkspaceMetadata(raw);
    repaired.push(workspace);
    await repairYearSheetsForWorkspace(workspace);
  }
  return { rootId, workspaces: repaired };
}

export async function listAttendanceFiles(): Promise<AttendanceFile[]> {
  const { rootId, workspaces } = await reconcileDrive();
  const files = await Promise.all(
    workspaces.map(async (workspace) => {
      const parentId = workspace.parents?.[0];
      const resolved = await resolveParentPath(parentId, rootId);
      return {
        id: workspace.id,
        name: workspace.name,
        workspaceKey: workspace.appProperties?.workspaceKey,
        folderPath: resolved.path,
        parentId,
        insideRoot: resolved.insideRoot,
        createdTime: workspace.createdTime,
        modifiedTime: workspace.modifiedTime,
        webViewLink: workspace.webViewLink,
      } satisfies AttendanceFile;
    })
  );
  return files.sort((a, b) => `${a.folderPath?.join("/") || ""}/${a.name}`.localeCompare(`${b.folderPath?.join("/") || ""}/${b.name}`, "he"));
}

export async function assertAttendanceWorkspace(workspaceId: string) {
  const file = await getDriveFile(workspaceId);
  if (file.trashed || file.mimeType !== FOLDER_MIME || file.appProperties?.attendanceApp !== "workspace") {
    throw new Error("תיק הנוכחות לא נמצא או נמחק ב-Google Drive");
  }
  return ensureWorkspaceMetadata(file);
}

async function ensureNamedFolder(parentId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("שם התיקייה לא יכול להיות ריק");
  if (cleanName.length > 100) throw new Error("שם התיקייה ארוך מדי");

  const query = `'${qEscape(parentId)}' in parents and mimeType='${FOLDER_MIME}' and name='${qEscape(cleanName)}' and trashed=false`;
  const existing = await driveList(query, "createdTime");
  if (existing.files[0]?.id) {
    const file = existing.files[0];
    if (!file.appProperties?.attendanceApp) {
      await patchDriveFile(file.id, { appProperties: managedProps("folder") });
    }
    return file;
  }

  return createDriveFile({
    name: cleanName,
    mimeType: FOLDER_MIME,
    parents: [parentId],
    appProperties: managedProps("folder"),
  });
}

function normalizePathParts(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).slice(0, 10);
}

async function ensureFolderPath(parts: string[]) {
  const rootId = await ensureRootFolder();
  let parentId = rootId;
  const clean = normalizePathParts(parts);
  for (const part of clean) {
    const folder = await ensureNamedFolder(parentId, part);
    parentId = folder.id;
  }
  return { rootId, parentId, path: clean };
}

export async function createAttendanceFile(input: CreateAttendanceFileInput): Promise<AttendanceFile> {
  const cleanName = input.name.trim();
  const path = normalizePathParts([input.folderName, input.subfolderName || ""]);
  if (!cleanName) throw new Error("צריך לתת שם לקובץ הנוכחות");
  if (!path.length) throw new Error("צריך לתת שם לתיקייה");
  if (cleanName.length > 100) throw new Error("שם קובץ הנוכחות ארוך מדי");

  const target = await ensureFolderPath(path);
  const duplicate = await driveList(`'${qEscape(target.parentId)}' in parents and mimeType='${FOLDER_MIME}' and name='${qEscape(cleanName)}' and trashed=false`);
  if (duplicate.files.some((file) => file.appProperties?.attendanceApp === "workspace")) {
    throw new Error("כבר קיים קובץ נוכחות בשם הזה בתיקייה שנבחרה");
  }

  const workspaceKey = randomUUID();
  const created = await createDriveFile({
    name: cleanName,
    mimeType: FOLDER_MIME,
    parents: [target.parentId],
    appProperties: managedProps("workspace", { workspaceKey }),
  });

  const now = israelNow();
  await ensureYearSpreadsheet(created.id, now.year);

  return {
    id: created.id,
    name: created.name,
    workspaceKey,
    folderPath: target.path,
    parentId: target.parentId,
    insideRoot: true,
    createdTime: created.createdTime,
    modifiedTime: created.modifiedTime,
    webViewLink: created.webViewLink,
  };
}

export async function renameAttendanceFile(workspaceId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("צריך לתת שם לקובץ");
  if (cleanName.length > 100) throw new Error("השם ארוך מדי");
  await assertAttendanceWorkspace(workspaceId);
  return patchDriveFile(workspaceId, { name: cleanName });
}

export async function moveAttendanceFile(workspaceId: string, pathParts: string[]) {
  const workspace = await assertAttendanceWorkspace(workspaceId);
  const target = await ensureFolderPath(pathParts);
  const oldParents = workspace.parents || [];
  const params: Record<string, string> = { addParents: target.parentId };
  if (oldParents.length) params.removeParents = oldParents.join(",");
  const updated = await patchDriveFile(workspaceId, {}, params);
  return { file: updated, folderPath: target.path, parentId: target.parentId };
}

export async function trashAttendanceFile(workspaceId: string) {
  await assertAttendanceWorkspace(workspaceId);
  await patchDriveFile(workspaceId, { trashed: true });
}

async function listFolderTree(rootId: string) {
  const folders: DriveFolder[] = [];
  const queue: Array<{ id: string; path: string[]; depth: number }> = [{ id: rootId, path: [], depth: 0 }];
  const visited = new Set<string>([rootId]);
  const workspaceParents = new Map<string, number>();
  const workspaces = await listGlobalWorkspaces();
  for (const workspace of workspaces) {
    const parent = workspace.parents?.[0];
    if (parent) workspaceParents.set(parent, (workspaceParents.get(parent) || 0) + 1);
  }

  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= 10) continue;
    const children = await driveList(`'${qEscape(current.id)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`, "name");
    for (const child of children.files) {
      if (visited.has(child.id) || child.appProperties?.attendanceApp === "workspace") continue;
      visited.add(child.id);
      const path = [...current.path, child.name];
      folders.push({
        id: child.id,
        name: child.name,
        parentId: current.id,
        path,
        depth: current.depth + 1,
        containsWorkspaces: workspaceParents.get(child.id) || 0,
      });
      queue.push({ id: child.id, path, depth: current.depth + 1 });
      if (folders.length > 1000) throw new Error("יש יותר מדי תיקיות תחת תיקיית הנוכחות");
    }
  }
  return folders;
}

export async function listAttendanceFolders() {
  const rootId = await ensureRootFolder();
  return listFolderTree(rootId);
}

export async function createAttendanceFolder(pathParts: string[]) {
  const target = await ensureFolderPath(pathParts);
  return { id: target.parentId, path: target.path };
}


export async function renameAttendanceFolder(folderId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("שם התיקייה לא יכול להיות ריק");
  if (cleanName.length > 100) throw new Error("שם התיקייה ארוך מדי");
  const rootId = await ensureRootFolder();
  if (folderId === rootId) throw new Error("את תיקיית השורש עדיף לשנות ישירות ב-Google Drive");
  const folders = await listFolderTree(rootId);
  if (!folders.some((folder) => folder.id === folderId)) throw new Error("התיקייה לא נמצאת תחת תיקיית הנוכחות");
  return patchDriveFile(folderId, { name: cleanName });
}

export async function trashAttendanceFolder(folderId: string) {
  const rootId = await ensureRootFolder();
  if (folderId === rootId) throw new Error("אי אפשר למחוק את תיקיית השורש של האפליקציה");
  const folders = await listFolderTree(rootId);
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) throw new Error("התיקייה לא נמצאת תחת תיקיית הנוכחות");
  await patchDriveFile(folderId, { trashed: true });
}

async function findYearSpreadsheet(workspaceId: string, year: number) {
  const workspace = await assertAttendanceWorkspace(workspaceId);
  const workspaceKey = workspace.appProperties?.workspaceKey || "";
  const global = await driveList(
    `mimeType='${SHEET_MIME}' and trashed=false and appProperties has { key='attendanceApp' and value='year' } and appProperties has { key='attendanceYear' and value='${year}' } and appProperties has { key='attendanceWorkspaceId' and value='${qEscape(workspaceId)}' }`,
    "modifiedTime desc"
  );
  if (global.files[0]?.id) {
    const file = global.files[0];
    return { file, needsInit: file.appProperties?.attendanceSchema !== SCHEMA_VERSION };
  }

  const byKey = workspaceKey
    ? await driveList(
        `mimeType='${SHEET_MIME}' and trashed=false and appProperties has { key='attendanceApp' and value='year' } and appProperties has { key='attendanceYear' and value='${year}' } and appProperties has { key='workspaceKey' and value='${qEscape(workspaceKey)}' }`,
        "modifiedTime desc"
      )
    : { files: [] as DriveFile[] };
  if (byKey.files[0]?.id) {
    const file = byKey.files[0];
    await patchDriveFile(file.id, {
      appProperties: {
        ...(file.appProperties || {}),
        ...managedProps("year", { attendanceYear: String(year), attendanceWorkspaceId: workspaceId, workspaceKey }),
      },
    });
    return { file, needsInit: true };
  }

  const base = `'${qEscape(workspaceId)}' in parents and mimeType='${SHEET_MIME}' and trashed=false`;
  const marked = await driveList(`${base} and appProperties has { key='attendanceYear' and value='${year}' }`);
  if (marked.files[0]?.id) return { file: marked.files[0], needsInit: true };

  const named = await driveList(`${base} and (name='${year}' or name='נוכחות ${year}')`);
  if (named.files[0]?.id) return { file: named.files[0], needsInit: true };
  return null;
}

async function sheetsMetadata(spreadsheetId: string) {
  return googleJson<{
    properties?: { title?: string; locale?: string; timeZone?: string };
    sheets?: Array<{ properties: { sheetId: number; title: string; index: number } }>;
    developerMetadata?: Array<{
      metadataId: number;
      metadataKey: string;
      metadataValue?: string;
      location?: { sheetId?: number; locationType?: string };
      visibility?: string;
    }>;
  }>(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties,sheets.properties,developerMetadata`);
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
  let metadata = await sheetsMetadata(spreadsheetId);
  const currentSheets = metadata.sheets || [];
  const titles = new Set(currentSheets.map((sheet) => sheet.properties.title));
  const taggedMonths = new Set(
    (metadata.developerMetadata || [])
      .filter((item) => item.metadataKey === "attendanceMonth" && item.metadataValue)
      .map((item) => Number(item.metadataValue))
      .filter((value) => value >= 1 && value <= 12)
  );
  const requests: Record<string, unknown>[] = [
    {
      updateSpreadsheetProperties: {
        properties: { locale: "iw_IL", timeZone: "Asia/Jerusalem" },
        fields: "locale,timeZone",
      },
    },
  ];

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

  for (let index = 0; index < MONTHS_HE.length; index++) {
    const monthNumber = index + 1;
    if (!taggedMonths.has(monthNumber) && !titles.has(MONTHS_HE[index])) {
      requests.push({ addSheet: { properties: { title: MONTHS_HE[index], rightToLeft: true, gridProperties: { frozenRowCount: 1 } } } });
    }
  }

  if (requests.length) await sheetsBatchUpdate(spreadsheetId, requests);
  metadata = await sheetsMetadata(spreadsheetId);

  const existingMonthMetadata = new Map<number, number>();
  for (const item of metadata.developerMetadata || []) {
    if (item.metadataKey === "attendanceMonth" && item.metadataValue && item.location?.sheetId) {
      existingMonthMetadata.set(Number(item.metadataValue), item.location.sheetId);
    }
  }

  const metadataRequests: Record<string, unknown>[] = [];
  for (let index = 0; index < MONTHS_HE.length; index++) {
    const monthNumber = index + 1;
    if (existingMonthMetadata.has(monthNumber)) continue;
    const sheet = metadata.sheets?.find((item) => item.properties.title === MONTHS_HE[index]);
    if (!sheet) continue;
    metadataRequests.push({
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: "attendanceMonth",
          metadataValue: String(monthNumber),
          visibility: "DOCUMENT",
          location: { sheetId: sheet.properties.sheetId },
        },
      },
    });
  }
  if (metadataRequests.length) await sheetsBatchUpdate(spreadsheetId, metadataRequests);

  for (let month = 1; month <= 12; month++) {
    const sheetName = await resolveMonthSheet(spreadsheetId, month, false);
    if (sheetName) await updateValues(spreadsheetId, `'${sheetName.replace(/'/g, "''")}'!A1:M1`, [HEADERS]);
  }
}

async function resolveMonthSheet(spreadsheetId: string, month: number, createIfMissing = true): Promise<string | null> {
  let metadata = await sheetsMetadata(spreadsheetId);
  const marker = (metadata.developerMetadata || []).find(
    (item) => item.metadataKey === "attendanceMonth" && Number(item.metadataValue) === month && item.location?.sheetId
  );
  if (marker?.location?.sheetId) {
    const sheet = metadata.sheets?.find((item) => item.properties.sheetId === marker.location!.sheetId);
    if (sheet) return sheet.properties.title;
  }

  const canonical = MONTHS_HE[month - 1];
  let sheet = metadata.sheets?.find((item) => item.properties.title === canonical);
  if (!sheet && createIfMissing) {
    await sheetsBatchUpdate(spreadsheetId, [{ addSheet: { properties: { title: canonical, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } } }]);
    metadata = await sheetsMetadata(spreadsheetId);
    sheet = metadata.sheets?.find((item) => item.properties.title === canonical);
  }
  if (!sheet) return null;

  await sheetsBatchUpdate(spreadsheetId, [
    {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: "attendanceMonth",
          metadataValue: String(month),
          visibility: "DOCUMENT",
          location: { sheetId: sheet.properties.sheetId },
        },
      },
    },
  ]);
  return sheet.properties.title;
}

export async function ensureYearSpreadsheet(workspaceId: string, year: number) {
  const workspace = await assertAttendanceWorkspace(workspaceId);
  const workspaceKey = workspace.appProperties?.workspaceKey || "";
  const existing = await findYearSpreadsheet(workspaceId, year);
  if (existing?.file?.id) {
    const id = existing.file.id;
    if (existing.needsInit) await initializeAttendanceSpreadsheet(id, false);
    const desired = managedProps("year", {
      attendanceYear: String(year),
      attendanceWorkspaceId: workspaceId,
      workspaceKey,
    });
    const props = existing.file.appProperties || {};
    if (
      existing.needsInit ||
      props.attendanceWorkspaceId !== workspaceId ||
      props.workspaceKey !== workspaceKey ||
      props.attendanceSchema !== SCHEMA_VERSION
    ) {
      await patchDriveFile(id, { appProperties: { ...props, ...desired } });
    }
    return id;
  }

  const created = await createDriveFile({
    name: `נוכחות ${year}`,
    mimeType: SHEET_MIME,
    parents: [workspaceId],
    appProperties: managedProps("year", {
      attendanceYear: String(year),
      attendanceWorkspaceId: workspaceId,
      workspaceKey,
    }),
  });
  await initializeAttendanceSpreadsheet(created.id, true);
  return created.id;
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

function parseBreaks(value?: string): AttendanceBreak[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.startIso === "string")
      .map((item) => ({
        id: item.id ? String(item.id) : undefined,
        start: String(item.start || ""),
        end: item.end ? String(item.end) : undefined,
        startIso: String(item.startIso),
        endIso: item.endIso ? String(item.endIso) : undefined,
      }));
  } catch {
    return [];
  }
}

function breakMinutesAt(breaks: AttendanceBreak[], at = new Date()) {
  return breaks.reduce((sum, item) => {
    const start = Date.parse(item.startIso);
    const end = item.endIso ? Date.parse(item.endIso) : at.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    return sum + Math.max(0, Math.floor((end - start) / 60000));
  }, 0);
}

function creditedMinutes(grossMinutes: number, breakMinutes: number) {
  return Math.max(0, grossMinutes - Math.max(0, breakMinutes - 40));
}

function rowToEntry(row: string[], year?: number, month?: number): AttendanceEntry {
  const breaks = parseBreaks(row[9]);
  const storedBreakMinutes = Number(row[10] || 0);
  const gross = Number(row[11] || row[5] || 0);
  return {
    id: row[0] || "",
    date: row[1] || "",
    weekday: row[2] || "",
    clockIn: row[3] || "",
    clockOut: row[4] || undefined,
    durationMinutes: Number(row[5] || 0),
    note: row[6] || undefined,
    clockInIso: row[7] || undefined,
    clockOutIso: row[8] || undefined,
    breaks,
    breakMinutes: storedBreakMinutes || (row[4] ? breakMinutesAt(breaks, row[8] ? new Date(row[8]) : new Date()) : breakMinutesAt(breaks)),
    grossDurationMinutes: gross,
    source: row[12] === "manual" ? "manual" : "quick",
    year,
    month,
  };
}

async function readMonthRows(workspaceId: string, year: number, month: number, createIfMissing = true) {
  let spreadsheetId: string | null = null;
  if (createIfMissing) spreadsheetId = await ensureYearSpreadsheet(workspaceId, year);
  else {
    const existing = await findYearSpreadsheet(workspaceId, year);
    spreadsheetId = existing?.file?.id || null;
  }
  if (!spreadsheetId) return null;

  const sheetName = await resolveMonthSheet(spreadsheetId, month, true);
  if (!sheetName) return null;
  const safeSheetName = sheetName.replace(/'/g, "''");
  const response = await getValues(spreadsheetId, `'${safeSheetName}'!A2:M2000`);
  const rows = (response.values || []).map((row, index) => ({
    rowNumber: index + 2,
    raw: row,
    entry: rowToEntry(row, year, month),
  }));
  return { spreadsheetId, sheetName, year, month, rows };
}

export async function getAttendanceEntries(workspaceId: string, year: number, month: number) {
  await assertAttendanceWorkspace(workspaceId);
  const current = await readMonthRows(workspaceId, year, month, true);
  if (!current) return [];
  const seen = new Set<string>();
  return current.rows
    .slice()
    .reverse()
    .filter((row) => {
      if (!row.entry.id || seen.has(row.entry.id)) return false;
      seen.add(row.entry.id);
      return true;
    })
    .map((row) => row.entry);
}

async function findEntryInMonth(workspaceId: string, entryId: string, year: number, month: number, createIfMissing = false) {
  const data = await readMonthRows(workspaceId, year, month, createIfMissing);
  if (!data) return null;
  const row = data.rows.find((item) => item.entry.id === entryId);
  return row ? { ...data, ...row } : null;
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
      if (row.entry.id && !row.entry.clockOut && row.entry.clockInIso) return { ...monthData, ...row };
    }
  }
  return null;
}

async function resolveTargetEntry(
  workspaceId: string,
  options: { entryId?: string; year?: number; month?: number; at?: Date } = {}
) {
  if (options.entryId && options.year && options.month) {
    const exact = await findEntryInMonth(workspaceId, options.entryId, options.year, options.month, false);
    if (exact) return exact;
  }
  return findOpenEntry(workspaceId, options.at || new Date());
}

export async function clockIn(
  workspaceId: string,
  options: { atIso?: string; entryId?: string } = {}
) {
  await assertAttendanceWorkspace(workspaceId);
  const at = options.atIso ? new Date(options.atIso) : new Date();
  if (!Number.isFinite(at.getTime())) throw new Error("זמן הכניסה לא תקין");
  const local = israelNow(at);
  const id = options.entryId || randomUUID();

  if (options.entryId) {
    const duplicate = await findEntryInMonth(workspaceId, id, local.year, local.month, false);
    if (duplicate) return duplicate.entry;
  }

  const existing = await findOpenEntry(workspaceId, at);
  if (existing) throw new Error("כבר קיימת כניסה פתוחה");

  const spreadsheetId = await ensureYearSpreadsheet(workspaceId, local.year);
  const sheetName = await resolveMonthSheet(spreadsheetId, local.month, true);
  if (!sheetName) throw new Error("לא ניתן לאתר את גיליון החודש");
  const row = [id, local.dateDisplay, local.weekday, local.timeDisplay, "", 0, "", at.toISOString(), "", "[]", 0, 0, "quick"];
  await appendValues(spreadsheetId, `'${sheetName.replace(/'/g, "''")}'!A:M`, [row]);
  return rowToEntry(row.map(String), local.year, local.month);
}

export async function startBreak(
  workspaceId: string,
  options: { atIso?: string; entryId?: string; year?: number; month?: number; breakId?: string } = {}
) {
  await assertAttendanceWorkspace(workspaceId);
  const at = options.atIso ? new Date(options.atIso) : new Date();
  if (!Number.isFinite(at.getTime())) throw new Error("זמן ההפסקה לא תקין");
  const open = await resolveTargetEntry(workspaceId, { ...options, at });
  if (!open) throw new Error("אין משמרת פעילה");
  if (open.entry.clockOut) return open.entry;
  const breaks = [...(open.entry.breaks || [])];
  const breakId = options.breakId || randomUUID();
  if (breaks.some((item) => item.id === breakId)) return open.entry;
  if (breaks.some((item) => !item.endIso)) throw new Error("כבר יצאת להפסקה");

  const local = israelNow(at);
  breaks.push({ id: breakId, start: local.timeDisplay, startIso: at.toISOString() });
  const completedBreakMinutes = breakMinutesAt(breaks.filter((item) => item.endIso), at);
  await batchUpdateValues(open.spreadsheetId, [
    { range: `'${open.sheetName.replace(/'/g, "''")}'!J${open.rowNumber}`, values: [[JSON.stringify(breaks)]] },
    { range: `'${open.sheetName.replace(/'/g, "''")}'!K${open.rowNumber}`, values: [[completedBreakMinutes]] },
  ]);
  return { ...open.entry, breaks, breakMinutes: completedBreakMinutes } satisfies AttendanceEntry;
}

export async function endBreak(
  workspaceId: string,
  options: { atIso?: string; entryId?: string; year?: number; month?: number; breakId?: string } = {}
) {
  await assertAttendanceWorkspace(workspaceId);
  const at = options.atIso ? new Date(options.atIso) : new Date();
  if (!Number.isFinite(at.getTime())) throw new Error("זמן החזרה מהפסקה לא תקין");
  const open = await resolveTargetEntry(workspaceId, { ...options, at });
  if (!open) throw new Error("אין משמרת פעילה");
  const breaks = [...(open.entry.breaks || [])];
  let index = options.breakId ? breaks.findIndex((item) => item.id === options.breakId) : -1;
  if (index >= 0 && breaks[index].endIso) return open.entry;
  if (index < 0) index = breaks.findLastIndex((item) => !item.endIso);
  if (index < 0) throw new Error("אין הפסקה פעילה");

  const local = israelNow(at);
  breaks[index] = { ...breaks[index], end: local.timeDisplay, endIso: at.toISOString() };
  const totalBreakMinutes = breakMinutesAt(breaks, at);
  await batchUpdateValues(open.spreadsheetId, [
    { range: `'${open.sheetName.replace(/'/g, "''")}'!J${open.rowNumber}`, values: [[JSON.stringify(breaks)]] },
    { range: `'${open.sheetName.replace(/'/g, "''")}'!K${open.rowNumber}`, values: [[totalBreakMinutes]] },
  ]);
  return { ...open.entry, breaks, breakMinutes: totalBreakMinutes } satisfies AttendanceEntry;
}

export async function clockOut(
  workspaceId: string,
  options: { atIso?: string; entryId?: string; year?: number; month?: number } = {}
) {
  await assertAttendanceWorkspace(workspaceId);
  const at = options.atIso ? new Date(options.atIso) : new Date();
  if (!Number.isFinite(at.getTime())) throw new Error("זמן היציאה לא תקין");
  const open = await resolveTargetEntry(workspaceId, { ...options, at });
  if (!open) throw new Error("אין כניסה פתוחה לסגירה");
  if (open.entry.clockOut) return open.entry;

  const local = israelNow(at);
  const startMs = Date.parse(open.entry.clockInIso!);
  if (!Number.isFinite(startMs) || at.getTime() <= startMs) throw new Error("זמן היציאה חייב להיות אחרי הכניסה");
  const grossDurationMinutes = Math.max(1, Math.floor((at.getTime() - startMs) / 60000));
  const breaks = [...(open.entry.breaks || [])];
  const openBreakIndex = breaks.findLastIndex((item) => !item.endIso);
  if (openBreakIndex >= 0) breaks[openBreakIndex] = { ...breaks[openBreakIndex], end: local.timeDisplay, endIso: at.toISOString() };
  const totalBreakMinutes = breakMinutesAt(breaks, at);
  const durationMinutes = creditedMinutes(grossDurationMinutes, totalBreakMinutes);

  await batchUpdateValues(open.spreadsheetId, [
    { range: `'${open.sheetName.replace(/'/g, "''")}'!E${open.rowNumber}`, values: [[local.timeDisplay]] },
    { range: `'${open.sheetName.replace(/'/g, "''")}'!F${open.rowNumber}`, values: [[durationMinutes]] },
    { range: `'${open.sheetName.replace(/'/g, "''")}'!I${open.rowNumber}`, values: [[at.toISOString()]] },
    { range: `'${open.sheetName.replace(/'/g, "''")}'!J${open.rowNumber}`, values: [[JSON.stringify(breaks)]] },
    { range: `'${open.sheetName.replace(/'/g, "''")}'!K${open.rowNumber}`, values: [[totalBreakMinutes]] },
    { range: `'${open.sheetName.replace(/'/g, "''")}'!L${open.rowNumber}`, values: [[grossDurationMinutes]] },
  ]);

  return {
    ...open.entry,
    clockOut: local.timeDisplay,
    clockOutIso: at.toISOString(),
    durationMinutes,
    grossDurationMinutes,
    breaks,
    breakMinutes: totalBreakMinutes,
  } satisfies AttendanceEntry;
}

function localIsraelDateTimeToDate(dateValue: string, timeValue: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!dateMatch || !timeMatch) throw new Error("תאריך או שעה לא תקינים");
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) throw new Error("תאריך או שעה לא תקינים");

  const wantedLocalEpoch = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = wantedLocalEpoch;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    const diff = wantedLocalEpoch - represented;
    if (!diff) break;
    candidate += diff;
  }
  return new Date(candidate);
}

function entryRow(input: {
  id: string;
  start: Date;
  end?: Date;
  breakMinutes: number;
  note?: string;
  source: "manual" | "quick";
  breaks?: AttendanceBreak[];
}) {
  const localStart = israelNow(input.start);
  const localEnd = input.end ? israelNow(input.end) : null;
  const grossDurationMinutes = input.end ? Math.max(1, Math.floor((input.end.getTime() - input.start.getTime()) / 60000)) : 0;
  const durationMinutes = input.end ? creditedMinutes(grossDurationMinutes, input.breakMinutes) : 0;
  return [
    input.id,
    localStart.dateDisplay,
    localStart.weekday,
    localStart.timeDisplay,
    localEnd?.timeDisplay || "",
    durationMinutes,
    input.note || "",
    input.start.toISOString(),
    input.end?.toISOString() || "",
    JSON.stringify(input.breaks || []),
    input.breakMinutes,
    grossDurationMinutes,
    input.source,
  ];
}

export async function addManualShift(
  workspaceId: string,
  input: { date: string; clockIn: string; clockOut: string; breakMinutes?: number; note?: string; entryId?: string }
) {
  await assertAttendanceWorkspace(workspaceId);
  const start = localIsraelDateTimeToDate(input.date, input.clockIn);
  let end = localIsraelDateTimeToDate(input.date, input.clockOut);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const now = Date.now();
  if (start.getTime() > now + 5 * 60 * 1000) throw new Error("אי אפשר להוסיף משמרת שמתחילה בעתיד");
  if (end.getTime() > now + 5 * 60 * 1000) throw new Error("אי אפשר להוסיף משמרת שמסתיימת בעתיד");

  const grossDurationMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
  if (grossDurationMinutes < 1 || grossDurationMinutes > 24 * 60) throw new Error("משך המשמרת לא תקין");
  const totalBreakMinutes = Math.max(0, Math.floor(Number(input.breakMinutes || 0)));
  if (totalBreakMinutes >= grossDurationMinutes) throw new Error("זמן ההפסקה לא יכול להיות ארוך מהמשמרת");

  const localStart = israelNow(start);
  const id = input.entryId || randomUUID();
  if (input.entryId) {
    const duplicate = await findEntryInMonth(workspaceId, id, localStart.year, localStart.month, false);
    if (duplicate) return duplicate.entry;
  }

  const spreadsheetId = await ensureYearSpreadsheet(workspaceId, localStart.year);
  const sheetName = await resolveMonthSheet(spreadsheetId, localStart.month, true);
  if (!sheetName) throw new Error("לא ניתן לאתר את גיליון החודש");
  const row = entryRow({ id, start, end, breakMinutes: totalBreakMinutes, note: input.note, source: "manual" });
  await appendValues(spreadsheetId, `'${sheetName.replace(/'/g, "''")}'!A:M`, [row]);
  return rowToEntry(row.map(String), localStart.year, localStart.month);
}

export async function updateAttendanceEntry(
  workspaceId: string,
  entryId: string,
  location: { year: number; month: number },
  input: { date: string; clockIn: string; clockOut?: string; breakMinutes?: number; note?: string }
) {
  await assertAttendanceWorkspace(workspaceId);
  const existing = await findEntryInMonth(workspaceId, entryId, location.year, location.month, false);
  if (!existing) throw new Error("הרשומה לא נמצאה. ייתכן שהיא שונתה ידנית ב-Drive; סנכרן ונסה שוב");

  const start = localIsraelDateTimeToDate(input.date, input.clockIn);
  let end: Date | undefined;
  if (input.clockOut) {
    end = localIsraelDateTimeToDate(input.date, input.clockOut);
    if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  const gross = end ? Math.floor((end.getTime() - start.getTime()) / 60000) : 0;
  if (end && (gross < 1 || gross > 24 * 60)) throw new Error("משך המשמרת לא תקין");
  const breaks = Math.max(0, Math.floor(Number(input.breakMinutes ?? existing.entry.breakMinutes ?? 0)));
  if (end && breaks >= gross) throw new Error("זמן ההפסקה לא יכול להיות ארוך מהמשמרת");
  const localStart = israelNow(start);
  const row = entryRow({
    id: entryId,
    start,
    end,
    breakMinutes: breaks,
    note: input.note,
    source: existing.entry.source || "manual",
    breaks: end ? [] : existing.entry.breaks || [],
  });

  if (localStart.year === location.year && localStart.month === location.month) {
    await updateValues(existing.spreadsheetId, `'${existing.sheetName.replace(/'/g, "''")}'!A${existing.rowNumber}:M${existing.rowNumber}`, [row]);
  } else {
    const targetId = await ensureYearSpreadsheet(workspaceId, localStart.year);
    const targetSheet = await resolveMonthSheet(targetId, localStart.month, true);
    if (!targetSheet) throw new Error("לא ניתן לאתר את גיליון היעד");
    await appendValues(targetId, `'${targetSheet.replace(/'/g, "''")}'!A:M`, [row]);
    await deleteAttendanceEntry(workspaceId, entryId, location);
  }
  return rowToEntry(row.map(String), localStart.year, localStart.month);
}

export async function deleteAttendanceEntry(
  workspaceId: string,
  entryId: string,
  location: { year: number; month: number }
) {
  await assertAttendanceWorkspace(workspaceId);
  const existing = await findEntryInMonth(workspaceId, entryId, location.year, location.month, false);
  if (!existing) return;
  const metadata = await sheetsMetadata(existing.spreadsheetId);
  const sheet = metadata.sheets?.find((item) => item.properties.title === existing.sheetName);
  if (!sheet) throw new Error("הגיליון של הרשומה לא נמצא");
  await sheetsBatchUpdate(existing.spreadsheetId, [
    {
      deleteDimension: {
        range: {
          sheetId: sheet.properties.sheetId,
          dimension: "ROWS",
          startIndex: existing.rowNumber - 1,
          endIndex: existing.rowNumber,
        },
      },
    },
  ]);
}
