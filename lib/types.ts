export type AttendanceBreak = {
  id?: string;
  start: string;
  end?: string;
  startIso: string;
  endIso?: string;
};

export type AttendanceEntry = {
  id: string;
  date: string;
  weekday: string;
  clockIn: string;
  clockOut?: string;
  durationMinutes: number;
  grossDurationMinutes?: number;
  breakMinutes?: number;
  breaks?: AttendanceBreak[];
  source?: "quick" | "manual";
  note?: string;
  clockInIso?: string;
  clockOutIso?: string;
  year?: number;
  month?: number;
};

export type AttendanceFile = {
  id: string;
  name: string;
  workspaceKey?: string;
  folderPath?: string[];
  parentId?: string;
  insideRoot?: boolean;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
};

export type DriveFolder = {
  id: string;
  name: string;
  parentId?: string;
  path: string[];
  depth: number;
  containsWorkspaces?: number;
};

export type CreateAttendanceFileInput = {
  name: string;
  folderName: string;
  subfolderName?: string;
};

export type DriveStatus = {
  configured: boolean;
  connected: boolean;
  mode: "not-configured" | "disconnected" | "google-drive";
  email?: string;
  name?: string;
};

export type OfflineAttendanceEvent = {
  id: string;
  type: "clock-in" | "break-start" | "break-end" | "clock-out" | "manual";
  workspaceId: string;
  entryId: string;
  atIso?: string;
  breakId?: string;
  year?: number;
  month?: number;
  payload?: {
    date?: string;
    clockIn?: string;
    clockOut?: string;
    breakMinutes?: number;
    note?: string;
  };
};
