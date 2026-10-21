import type { MetadataRoute } from "next";
import { SITE_URL } from "@cofounderai/core/site";

/**
 * Every public, indexable page: the landing page, pricing, careers, sign-up and the legal pages.
 * Nothing behind a login is listed, the help guides included -- see robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly") => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  });

  return [
    page("/", 1, "weekly"),
    page("/pricing", 0.9, "monthly"),
    page("/careers", 0.6, "weekly"),
    page("/signup", 0.8, "monthly"),
    page("/terms", 0.3, "yearly"),
    page("/privacy", 0.3, "yearly"),
  ];
}
