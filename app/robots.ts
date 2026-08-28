import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms"],
      disallow: ["/api/"],
    },
    sitemap: "https://attendance-app-blush-two.vercel.app/sitemap.xml",
  };
}
