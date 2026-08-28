import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Attendance App – נוכחות בעבודה",
    short_name: "נוכחות",
    description: "ניהול כניסה, יציאה, הפסקות ומשמרות עם סנכרון Google Drive ו-Google Sheets",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#111827",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
