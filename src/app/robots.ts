import type { MetadataRoute } from "next";
import { isFlagEnabled } from "@/lib/flags";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://zaffa.app"
  );
}

export default function robots(): MetadataRoute.Robots {
  // Anything inside the dashboard, auth flow, or platform APIs should never
  // be indexed — these pages either require auth, expose tokens in URLs, or
  // have no SEO value. While public browse is gated off we also disallow the
  // catalog routes belt-and-braces (the pages themselves 404 + emit
  // `noindex`, but a stale crawler shouldn't even ask).
  const disallow = [
    "/dashboard/",
    "/auth/",
    "/api/",
    "/unsubscribed",
    "/venue-designer/",
  ];
  if (!isFlagEnabled("publicBrowse")) {
    disallow.push("/planners", "/vendors");
  }

  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
