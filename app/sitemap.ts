import type { MetadataRoute } from "next";

const defaultSiteUrl = "https://drivemateparts.com.au";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || defaultSiteUrl).replace(/\/+$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  return [
    {
      url: `${siteUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/catalogue`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
