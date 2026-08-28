import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

const productionUrl = "https://attendance-app-blush-two.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: {
    default: "Attendance App – נוכחות בעבודה",
    template: "%s | Attendance App",
  },
  description: "אפליקציית נוכחות אישית לניהול כניסה, יציאה, הפסקות ומשמרות עם סנכרון Google Drive ו-Google Sheets.",
  applicationName: "Attendance App",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "נוכחות",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Attendance App – נוכחות בעבודה",
    description: "ניהול נוכחות, משמרות והפסקות עם סנכרון Google Drive ו-Google Sheets.",
    url: productionUrl,
    siteName: "Attendance App",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Attendance App" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f16" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
