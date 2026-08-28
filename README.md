# Attendance App / אפליקציית נוכחות

Mobile-first attendance PWA, optimized first for iPhone and responsive across desktop and Android.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS v4 (plus custom CSS for the product UI)
- PWA manifest + lightweight service worker
- Google Drive / Sheets adapter boundary (OAuth wiring is the next step)

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Google Drive integration
Copy `.env.example` to `.env.local` and later add your Google OAuth credentials.
Secrets are server-side only. Never commit `.env.local`.

The intended model is bidirectional:
- create/rename/trash in app -> same operation in Drive
- Drive changes -> app refreshes from Drive Changes API
- attendance rows live in Google Sheets; app does not keep an independent canonical copy

## Git + Vercel
```bash
git init
git add -A
git commit -m "feat: initial attendance PWA"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```
Then import the repository in Vercel. Vercel auto-detects Next.js.

## iPhone details
- `viewport-fit=cover`
- safe area insets for Dynamic Island / home indicator
- `100dvh`
- touch-sized controls
- bottom navigation
- standalone PWA metadata
