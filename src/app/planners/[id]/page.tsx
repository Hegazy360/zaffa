import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isFlagEnabled } from "@/lib/flags";
import PublicPlannerProfilePage from "./profile-client";

// Server gate around the public planner detail view. The actual UI is the
// (client-only) `profile-client.tsx` next to this file. Gating lives here so:
//   - When `publicBrowse` is off the route 404s entirely (no chrome, no
//     loading state, no API round-trip).
//   - We can emit `noindex` metadata so search engines stop ranking it.
export function generateMetadata(): Metadata {
  if (!isFlagEnabled("publicBrowse")) {
    return { robots: { index: false, follow: false } };
  }
  return {};
}

export default function Page() {
  if (!isFlagEnabled("publicBrowse")) notFound();
  return <PublicPlannerProfilePage />;
}
