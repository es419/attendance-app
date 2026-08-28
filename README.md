# Attendance App / אפליקציית נוכחות

Mobile-first attendance PWA, optimized first for iPhone and responsive across Android, tablet and desktop.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS v4 + custom mobile-first CSS
- PWA manifest + service worker
- Google OAuth 2.0
- Google Drive API as the source of truth
- Google Sheets API for attendance rows

## Drive-first reconciliation
The app does not identify its data by filenames. App-created Drive objects receive stable metadata:
- root folder: `attendanceApp=root`
- attendance workspace: `attendanceApp=workspace` + a stable `workspaceKey`
- yearly spreadsheet: `attendanceApp=year` + year + workspace identifiers
- month tabs: Google Sheets developer metadata `attendanceMonth=1..12`

On every reconnect and normal refresh, the app performs reconciliation against Drive. This means:
- workspace rename -> detected
- workspace move -> detected, even if moved outside the original app root
- parent folder rename/move -> displayed path is rebuilt from Drive
- workspace trash/restore -> disappears/reappears after sync
- yearly spreadsheet rename/move -> still found from metadata
- month tab rename -> still found from developer metadata
- manual row edits in Sheets -> re-read on the next sync

Google Drive / Sheets remain canonical. Local data is only a cache and an offline operation queue.

## Offline mode
The last known files and monthly records are cached locally per device.

Clock-in, break start/end, clock-out and manual shifts can be queued while:
- the network is unavailable, or
- the Google account is disconnected.

Each queued action has stable IDs so replay is idempotent. On reconnect the app:
1. reconciles Drive structure,
2. replays pending attendance actions in order,
3. re-reads the active month from Sheets,
4. restores the canonical active shift from Drive metadata.

If a queued action conflicts with a workspace that was deleted or changed incompatibly in Drive, synchronization stops and the pending action remains visible instead of silently discarding it.

## Attendance
- Persistent quick clock-in / clock-out: an active shift is remembered across refreshes, app closes, device changes and reconnects until clock-out
- Start break / return from break
- Multiple breaks per shift
- Configurable break allowance per attendance workspace (default 40 minutes); only break time above the configured allowance is deducted
- Clock-out while on break closes the break automatically
- Manual shifts with date, start/end, break total and note
- Overnight manual shifts supported
- Edit every row from the app
- Delete rows from the app
- Browse months/years from the records screen

## Files, folders and paths
- Create attendance workspace under folder + optional subfolder
- Rename workspace
- Move workspace to any path under the app root; missing folders are created automatically
- Trash workspace
- Create nested folder paths
- Rename folders
- Trash folders
- Direct Drive changes are picked up by reconciliation

## Appearance and account
- System / Light / Dark theme
- iPhone safe-area support
- Side settings drawer
- Disconnect from Google Drive (revokes refresh token when possible)

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

Before pushing:
```bash
npm run build
```

## Google Cloud
Enable:
- Google Drive API
- Google Sheets API

OAuth scopes used by this project:
- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/userinfo.profile`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/spreadsheets`

Local redirect URI:
`http://localhost:3000/api/auth/google/callback`

Production redirect URI:
`https://YOUR-VERCEL-DOMAIN/api/auth/google/callback`

Environment variables:
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=...
GOOGLE_REDIRECT_URI=https://YOUR-VERCEL-DOMAIN/api/auth/google/callback
GOOGLE_DRIVE_ROOT_FOLDER_ID=
```

Never commit `.env.local` or OAuth client JSON files.

## Persistent active shift
Quick clock-in writes an active-shift pointer into the workspace Drive metadata and also caches it locally. The app can therefore restore an open shift even after a browser/app restart or a month boundary. Clock-out clears the pointer. If metadata is missing or stale, the app checks the current/previous month and repairs the pointer without a costly historical scan.

## Break allowance setting
Each attendance workspace stores `breakAllowanceMinutes` in Drive appProperties. Default is 40. The side drawer offers presets and a custom numeric value. Updating the rule recalculates closed rows in managed yearly Sheets so historical totals and the app stay consistent.

### Google Sheets – human-readable break columns

The annual Sheets keep technical identifiers/ISO/JSON columns hidden, while the visible view includes `סה״כ הפסקה (דק׳)`, `פירוט הפסקות`, `דקות חריגה`, `כלל הפסקה (דק׳)`, `דקות משמרת ברוטו`, and `דקות עבודה בפועל`. Existing year files are upgraded automatically when the app next opens/uses them.

## Quick clock-in quota protection
Quick attendance mutations now apply the authoritative row returned by the API directly to the local cache/UI instead of immediately re-reading both the month and active-shift endpoints. Active-shift recovery uses Drive metadata first and only checks the current/previous month when repair is needed. Spreadsheet schema migrations read all month ranges through one Sheets `batchGet` request instead of issuing a separate read per tab.

## Persistent Google connection
The Google refresh token is kept only inside an encrypted HttpOnly cookie and is used server-side to refresh short-lived access tokens automatically. The encrypted session cookie is valid for up to one year unless the user explicitly disconnects/revokes access. Note that Google OAuth projects left in **Testing** can still expire refresh tokens after a short testing period; move the OAuth app to Production for long-lived personal use once testing is complete.

## Google OAuth — מעבר ל-Production (לשימוש אישי)

הגרסה הזו כוללת את כל דפי ה-branding הציבוריים הדרושים:

- Home: `https://attendance-app-blush-two.vercel.app/`
- Privacy Policy: `https://attendance-app-blush-two.vercel.app/privacy`
- Terms of Service: `https://attendance-app-blush-two.vercel.app/terms`
- OAuth callback: `https://attendance-app-blush-two.vercel.app/api/auth/google/callback`
- Logo upload: `public/icon-512.png`

ב-Google Auth Platform > Branding יש למלא:

- App name: `Attendance App`
- User support email: כתובת האימייל של בעל האפליקציה
- App logo: `public/icon-512.png`
- Application home page: כתובת ה-Home שלמעלה
- Application privacy policy link: כתובת ה-Privacy שלמעלה
- Application terms of service link: כתובת ה-Terms שלמעלה
- Developer contact information: כתובת האימייל של בעל האפליקציה

ב-Google Auth Platform > Clients > Web application יש להשאיר את localhost לפיתוח ולהוסיף ל-Production:

`https://attendance-app-blush-two.vercel.app/api/auth/google/callback`

אין צורך ב-Authorized JavaScript origin בארכיטקטורת OAuth השרתית הנוכחית.

> הערה: שימוש אישי או שימוש בידי מספר קטן של משתמשים מוכרים עשוי להיות פטור מ-verification מלא של Google. אם Google דורשת אימות בעלות על דומיין לצורך Brand Verification, דומיין `vercel.app` הוא דומיין משותף שאינו בבעלות המשתמש; במקרה כזה יש להישאר בחריג personal use/unverified או לעבור בעתיד לדומיין פרטי.

## UI layout polish
- Explicit Google Drive logout returns to a dedicated centered reconnect screen.
- Attendance records use a single full-width row and expose gross time, break time, excess break time and credited time.
- Bottom navigation is pinned to the viewport with a fixed safe-area-aware layout on iPhone and desktop.


## UX updates
- Quick clock-in and clock-out use a deliberate long press to prevent accidental attendance actions.
- The app UI is intentionally independent from the Google Sheets schema; Sheets/Drive remain the data layer while the app presents a compact mobile-first view.
- Attendance cards use collision-safe RTL/LTR layout for dates and times on iPhone-sized screens.


## Performance + loading UX

- Attendance records render only date, clock-in, clock-out, and final credited duration in the app UI. The Sheet remains the detailed backend.
- GET requests are deduplicated, cached data is painted first, and file/attendance refreshes are freshness-throttled.
- Drive folder discovery is lazy and only runs when folder management is opened.
- Background Drive reconciliation runs every 3 minutes; foreground refreshes are debounced and cache-aware.
- The UI clock refresh interval is reduced to avoid rerendering the whole app every second.
- Initial boot and tab changes use the app icon as a branded loading transition.

## Auth persistence / canonical Vercel host

The app now redirects Vercel deployment-specific hostnames to the canonical origin derived from `GOOGLE_REDIRECT_URI`. This matters because OAuth cookies are host-bound: authenticating on the stable production alias and later opening a deployment URL would otherwise appear as a disconnected session. Keep `GOOGLE_REDIRECT_URI` set to the stable production URL, e.g. `https://attendance-app-blush-two.vercel.app/api/auth/google/callback`.
