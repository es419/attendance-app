/**
 * Server-side Drive adapter boundary.
 * UI code should never call Google Drive directly or contain OAuth secrets.
 *
 * Planned operations:
 * - listAttendanceFiles()
 * - createAttendanceFile(name)
 * - renameAttendanceFile(fileId, name)
 * - trashAttendanceFile(fileId)
 * - syncDriveChanges(pageToken)
 * - appendClockIn / updateClockOut through Sheets API
 */
export const driveConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);
