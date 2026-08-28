export type AttendanceEntry = {
  id: string;
  date: string;
  weekday: string;
  clockIn: string;
  clockOut?: string;
  durationMinutes: number;
};

export type AttendanceFile = {
  id: string;
  name: string;
  year: number;
  monthHours: number;
  targetHours: number;
  syncState: "synced" | "syncing" | "offline";
};
