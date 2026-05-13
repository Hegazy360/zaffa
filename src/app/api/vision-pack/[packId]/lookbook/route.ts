import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { LookbookDocument } from "@/components/vision-pack/lookbook-pdf";
import { reportError } from "@/lib/logger";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { isFreePack } from "@/lib/vision-pack";

interface RouteParams {
  params: Promise<{ packId: string }>;
}

interface PaletteJson {
  name?: string;
  colors?: string[];
}

function paletteOf(value: unknown): { name?: string; colors: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { colors: [] };
  }
  const obj = value as PaletteJson;
  return {
    name: obj.name,
    colors: Array.isArray(obj.colors)
      ? obj.colors.filter((c): c is string => typeof c === "string")
      : [],
  };
}

interface RefItem {
  id: string;
  url: string;
}

interface RefBuckets {
  overall_vibe: RefItem[];
  tables: RefItem[];
  flowers: RefItem[];
  lighting: RefItem[];
  venue_decor: RefItem[];
}

function referencesOf(value: unknown): RefBuckets {
  const empty: RefBuckets = {
    overall_vibe: [],
    tables: [],
    flowers: [],
    lighting: [],
    venue_decor: [],
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const obj = value as Record<string, unknown>;
  for (const cat of Object.keys(empty) as (keyof RefBuckets)[]) {
    const arr = obj[cat];
    if (Array.isArray(arr)) {
      empty[cat] = arr.filter(
        (r): r is RefItem =>
          !!r &&
          typeof r === "object" &&
          typeof (r as { url?: unknown }).url === "string" &&
          typeof (r as { id?: unknown }).id === "string",
      );
    }
  }
  return empty;
}

/**
 * Streams the recipient's lookbook PDF. Auth-gated to the pack's
 * recipient. First successful download stamps `lookbook_downloaded_at`
 * (the refund tripwire) so we can't refund after the user has the
 * artefact in hand.
 *
 * Returns 404 for non-recipients (intentionally — we don't leak the
 * existence of the pack to other authenticated users).
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { packId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pack = await prisma.visionPack.findFirst({
    where: { id: packId, recipient_user_id: userId },
    select: {
      id: true,
      sku: true,
      status: true,
      recipient: {
        select: { id: true, full_name: true },
      },
      lookbook_downloaded_at: true,
      microsite_published_at: true,
    },
  });
  if (!pack) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (pack.status !== "active" && pack.status !== "fulfilled") {
    return NextResponse.json({ error: "pack_inactive" }, { status: 409 });
  }
  // Free-tier packs only entitle the email-gated render — the lookbook
  // PDF is a paid-pack feature. The share panel disables the button
  // client-side; this guard catches anyone hand-crafting a request.
  if (isFreePack(pack.sku)) {
    return NextResponse.json({ error: "free_tier_not_allowed" }, { status: 403 });
  }

  // Latest design — same heuristic the microsite uses.
  const design = await prisma.venueDesign.findFirst({
    where: { user_id: pack.recipient!.id },
    orderBy: { updated_at: "desc" },
    select: {
      name: true,
      event_type: true,
      setting: true,
      size: true,
      palette: true,
      references: true,
      style_notes: true,
      thumbnail: true,
      media: {
        orderBy: { created_at: "desc" },
        select: { id: true, type: true, url: true },
      },
    },
  });
  if (!design) {
    return NextResponse.json({ error: "no_design" }, { status: 409 });
  }

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(
      LookbookDocument({
        recipientName: pack.recipient!.full_name ?? "Our wedding",
        publishedAt: pack.microsite_published_at,
        design: {
          name: design.name,
          event_type: design.event_type,
          setting: design.setting,
          size: design.size,
          palette: paletteOf(design.palette),
          references: referencesOf(design.references),
          style_notes: design.style_notes,
          media: design.media,
        },
      }),
    );
  } catch (err) {
    reportError("vision_pack.lookbook.render_failed", err, { packId });
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }

  // Refund tripwire: stamp on first download. Subsequent downloads are
  // a no-op so re-downloading doesn't muddy the timeline.
  if (!pack.lookbook_downloaded_at) {
    await prisma.visionPack
      .update({
        where: { id: pack.id },
        data: { lookbook_downloaded_at: new Date() },
      })
      .catch((err: unknown) =>
        reportError("vision_pack.lookbook.tripwire_failed", err, { packId }),
      );
    await trackServer(
      userId,
      ANALYTICS_EVENTS.VISION_PACK_LOOKBOOK_DOWNLOADED,
      { pack_id: packId },
    );
  }

  const filename = (pack.recipient?.full_name ?? "wedding-vision")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "wedding-vision";

  // react-pdf's `renderToBuffer` returns a node Buffer. Wrap it in a
  // Uint8Array view so we can hand it to NextResponse without copying;
  // the underlying ArrayBuffer is what `Response` expects.
  const body = new Uint8Array(buffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}-lookbook.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
