import type { AttendanceEntry, AttendanceFile } from "./types";

export const entries: AttendanceEntry[] = [
  { id: "1", date: "28.08.2026", weekday: "יום שישי", clockIn: "08:01", durationMinutes: 102 },
  { id: "2", date: "27.08.2026", weekday: "יום חמישי", clockIn: "08:04", clockOut: "16:12", durationMinutes: 488 },
  { id: "3", date: "26.08.2026", weekday: "יום רביעי", clockIn: "07:57", clockOut: "16:03", durationMinutes: 486 },
];

export const files: AttendanceFile[] = [
  { id: "drive-file-2026", name: "עבודה – מס הכנסה", year: 2026, monthHours: 84.5, targetHours: 120, syncState: "synced" }
];
