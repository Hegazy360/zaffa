// Cloudinary signed-upload signature for client-side rasterized slide
// PNGs.
//
// We can't use the same upload-stream pattern as `/api/upload/avatar`
// here because the rasterized PNG is generated in the browser (via
// `html-to-image`) and would be MB-sized — streaming it back through
// our server is wasteful and serverless-unfriendly. Instead we hand the
// client a signed payload and let the browser POST directly to
// Cloudinary's REST endpoint.
//
// Auth: same admin role gate the rest of the admin surface uses
// (getNavUser → profile.role === "admin"). This route is the only
// `/api/admin/*` REST endpoint in the app.

import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getNavUser } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";

export const runtime = "nodejs";

const FOLDER = "zaffa-posts/slides";

export async function POST() {
  const user = await getNavUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const limit = await consume("mutationDefault", `posts-upload:${user.id}`);
  if (!limit.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429 },
    );
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "cloudinary_not_configured" },
      { status: 500 },
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: FOLDER },
    apiSecret,
  );

  return NextResponse.json({
    cloud_name: cloudName,
    api_key: apiKey,
    timestamp,
    signature,
    folder: FOLDER,
  });
}
