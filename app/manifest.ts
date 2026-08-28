import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "נוכחות בעבודה",
    short_name: "נוכחות",
    description: "אפליקציית כניסה ויציאה לעבודה עם סנכרון Google Drive",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#111827",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
