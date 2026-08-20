import { NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/logger";
import { consume } from "@/lib/rate-limit";

// 5 MB hard ceiling (Cloudinary default free-tier per image is much larger;
// this is to avoid an attacker streaming gigabytes through us).
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Per-user rate limit so a stuck client can't loop. Using the
  // mutationDefault bucket, avatar churn is naturally low.
  const limit = await consume("mutationDefault", `avatar:${user.id}`);
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
            folder: `zaffa/avatars/${user.id}`,
            resource_type: "image",
            transformation: [
              { width: 400, height: 400, crop: "fill", gravity: "face" },
              { quality: "auto", fetch_format: "auto" },
            ],
            // Each user has at most one avatar at a time, overwrite the
            // previous so we don't accumulate orphan images.
            public_id: "current",
            overwrite: true,
            invalidate: true,
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

    await prisma.profile.update({
      where: { id: user.id },
      data: { avatar_url: uploaded.secure_url },
      select: { id: true },
    });

    return NextResponse.json({ url: uploaded.secure_url });
  } catch (err) {
    reportError("upload.avatar.failed", err, { userId: user.id });
    return NextResponse.json(
      { error: "upload_failed" },
      { status: 500 },
    );
  }
}
