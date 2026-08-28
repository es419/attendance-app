import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const metadata: Metadata = {
  title: "נוכחות בעבודה",
  description: "אפליקציית נוכחות מסונכרנת עם Google Drive",
  applicationName: "נוכחות",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "נוכחות",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f7fb",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
