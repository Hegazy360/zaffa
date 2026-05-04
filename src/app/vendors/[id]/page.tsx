import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isFlagEnabled } from "@/lib/flags";
import PublicVendorProfilePage from "./profile-client";

// Server gate around the public vendor detail view. Mirrors the planner
// version — `publicBrowse=false` makes this URL 404 entirely, so vendor
// pricing, portfolios, and reviews never reach an unauthenticated client.
export function generateMetadata(): Metadata {
  if (!isFlagEnabled("publicBrowse")) {
    return { robots: { index: false, follow: false } };
  }
  return {};
}

export default function Page() {
  if (!isFlagEnabled("publicBrowse")) notFound();
  return <PublicVendorProfilePage />;
}
