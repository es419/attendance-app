import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const metadata: Metadata = {
  title: "נוכחות בעבודה",
  description: "אפליקציית נוכחות מסונכרנת עם Google Drive",
  applicationName: "נוכחות",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
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
