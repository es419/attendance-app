import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://attendance-app-blush-two.vercel.app";
  return [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacy`, lastModified: new Date("2026-08-28"), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/terms`, lastModified: new Date("2026-08-28"), changeFrequency: "monthly", priority: 0.5 },
  ];
}
