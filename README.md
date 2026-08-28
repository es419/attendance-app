# Attendance App / אפליקציית נוכחות

Mobile-first attendance PWA, optimized first for iPhone and responsive across desktop and Android.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS v4 + custom mobile-first CSS
- PWA manifest + service worker
- Google OAuth 2.0
- Google Drive API as the source of truth
- Google Sheets API for attendance rows

## What is synchronized
- Create a file in the app -> creates a real workspace folder in Google Drive.
- Rename it in the app -> renames the same Drive folder.
- Delete it in the app -> moves the same Drive folder to Google Drive Trash.
- Create/rename/delete a workspace folder directly in the app root folder in Drive -> the app reflects it on focus and at most ~15 seconds later.
- First creation/first use creates `נוכחות YYYY` inside the workspace with 12 month tabs.
- Clock-in/clock-out writes directly to the relevant Google Sheet. There is no second canonical database.

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Google Cloud setup
1. Open Google Cloud Console and create/select a project.
2. Enable **Google Drive API** and **Google Sheets API**.
3. Configure the **OAuth consent screen**. For a personal/testing app, add your Google account as a test user.
4. Create an OAuth Client ID of type **Web application**.
5. Add this local redirect URI exactly:
   `http://localhost:3000/api/auth/google/callback`
6. Later, after Vercel deployment, also add:
   `https://YOUR-VERCEL-DOMAIN/api/auth/google/callback`
7. Copy `.env.example` to `.env.local` and fill in the values.

Generate `AUTH_SECRET` with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example `.env.local`:
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_DRIVE_ROOT_FOLDER_ID=
```

If `GOOGLE_DRIVE_ROOT_FOLDER_ID` is empty, the app finds or creates a root Drive folder named `נוכחות בעבודה`.

After changing `.env.local`, stop the dev server with `Ctrl+C` and run `npm run dev` again.

## Vercel
Add the same environment variables under **Project -> Settings -> Environment Variables**.
For production, set:
```env
GOOGLE_REDIRECT_URI=https://YOUR-VERCEL-DOMAIN/api/auth/google/callback
```
Then add exactly the same URI to the OAuth Client in Google Cloud.

## Security
- OAuth client secret and refresh token never go to client-side JavaScript.
- Refresh token is stored in an encrypted, HttpOnly cookie using `AUTH_SECRET`.
- API routes refresh short-lived Google access tokens server-side.
- Drive operations are constrained to workspaces directly inside the attendance root folder.

## iPhone details
- `viewport-fit=cover`
- safe area insets for Dynamic Island / Home Indicator
- `100dvh`
- touch-sized controls
- bottom navigation
- standalone PWA metadata
- live resync on app focus/return from background
