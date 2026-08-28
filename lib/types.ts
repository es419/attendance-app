export type AttendanceEntry = {
  id: string;
  date: string;
  weekday: string;
  clockIn: string;
  clockOut?: string;
  durationMinutes: number;
  clockInIso?: string;
  clockOutIso?: string;
};

export type AttendanceFile = {
  id: string;
  name: string;
  folderPath?: string[];
  parentId?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
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
