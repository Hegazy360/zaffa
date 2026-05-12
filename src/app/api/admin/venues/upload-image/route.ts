// Cloudinary upload endpoint for admin-curated venue photos.
//
// Mirrors the avatar upload route at `/api/upload/avatar`: the form-data
// blob is streamed straight through Cloudinary's upload_stream API and
// the secure URL is returned. The caller (admin venues editor) then
// records the URL via `venues.adminAddImage` so the image lives in our
// DB and can be reordered/removed without touching Cloudinary again.
//
// Auth: same admin role gate the rest of the admin surface uses.

import { NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import { getNavUser } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/logger";
import { consume } from "@/lib/rate-limit";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const runtime = "nodejs";

export async function POST(request: Request) {
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

  const limit = await consume("mutationDefault", `venues-upload:${user.id}`);
  if (!limit.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded: { secure_url: string; public_id: string } =
      await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `zaffa/venues`,
            resource_type: "image",
            transformation: [
              { width: 1600, crop: "limit" },
              { quality: "auto", fetch_format: "auto" },
            ],
          },
          (err, result) => {
            if (err || !result) {
              return reject(err ?? new Error("upload failed"));
            }
            resolve({
              secure_url: result.secure_url,
              public_id: result.public_id,
            });
          },
        );
        stream.end(buffer);
      });

    return NextResponse.json({ url: uploaded.secure_url });
  } catch (err) {
    reportError("upload.venue.failed", err, { userId: user.id });
    return NextResponse.json(
      { error: "upload_failed" },
      { status: 500 },
    );
  }
}
