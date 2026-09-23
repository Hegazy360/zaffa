// The admin enquiry page's "Their design" brief (F5, "Leads that never rot").
//
// The first approved lead reached the admin page as a name and a guest
// count: the page could not show the render (it read the always-null
// `thumbnail`), the palette, the notes or the venue. This turns a design and
// its render rows into everything the team needs to quote without opening
// the designer: the chosen render, every version with what the couple asked
// to change, the venue before and after, palette, notes, the English brief
// when one was stored, and the decor plan totals.
//
// Pure (no Prisma, no network) so the enquiries router can call it and tests
// can pin it. The decor plan is priced from the CACHED analysis only: viewing
// a lead must never spend a model call; the page offers a button for that.

import { parseMediaMeta, parseVenuePhoto, type MediaMode } from "@/lib/design-media-meta";
import { readStoredDecor } from "@/lib/decor-analysis";
import { computeDecorPlan, marketForCountry, type DecorMarket } from "@/lib/decor-pricing";
import { pickBeforeAfter, pickPlanRender } from "@/lib/lookbook-picks";

export interface BriefRenderRow {
  id: string;
  url: string;
  parent_id: string | null;
  meta: unknown;
  created_at: Date;
}

export interface BriefDesignInput {
  guest_count: number | null;
  size: string | null;
  setting: string | null;
  palette: unknown;
  style_notes: string | null;
  venue_photo: unknown;
  selected_media_id: string | null;
  /** Render rows, any order. */
  media: BriefRenderRow[];
}

export interface BriefVersion {
  id: string;
  /** 1 for the first render, in the order they were made. */
  number: number;
  /** Clean URL: admins always see the unwatermarked render. */
  url: string;
  createdAt: Date;
  mode: MediaMode | null;
  /** What the couple typed to get this version, verbatim. */
  instruction: string | null;
  /** The English edit the image model received. */
  instructionEn: string | null;
  /** The version this one was refined from. */
  parentNumber: number | null;
  selected: boolean;
}

export interface DesignBrief {
  /** The render to quote: the one the couple chose, else the newest. */
  selected: (BriefVersion & { pinned: boolean }) | null;
  versions: BriefVersion[];
  venue: {
    photoUrl: string;
    /** A render that dressed this photo, for before and after. */
    dressed: { url: string; number: number } | null;
  } | null;
  palette: { name: string | null; colors: string[] };
  styleNotes: string | null;
  /** The clean English brief a render was made from, when one was stored. */
  briefEn: string | null;
  plan: {
    market: DecorMarket;
    currency: string;
    lo: number;
    hi: number;
    guestCount: number;
    guestCountAssumed: boolean;
    tables: number;
    items: number;
  } | null;
  /** The chosen render has not been read yet, so there is no plan to show. */
  planNeedsAnalysis: boolean;
}

const HEX = /^#[0-9a-f]{3,8}$/i;

function readPalette(json: unknown): DesignBrief["palette"] {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { name: null, colors: [] };
  }
  const obj = json as Record<string, unknown>;
  const colors = Array.isArray(obj.colors)
    ? obj.colors.filter((c): c is string => typeof c === "string" && HEX.test(c))
    : [];
  return { name: typeof obj.name === "string" && obj.name ? obj.name : null, colors };
}

/** A string field of the loose meta record, when it is a non-empty string. */
function metaString(json: unknown, key: string): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildDesignBrief(
  design: BriefDesignInput,
  opts: { country: string | null },
): DesignBrief {
  const oldestFirst = [...design.media].sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  );
  const numberOf = new Map(oldestFirst.map((m, i) => [m.id, i + 1]));
  // The lookbook's pickers take rows newest first, typed.
  const newestFirst = [...oldestFirst].reverse().map((m) => ({ ...m, type: "render" }));
  const chosen = pickPlanRender(newestFirst, design.selected_media_id);

  const versions: BriefVersion[] = oldestFirst.map((m, i) => {
    const meta = parseMediaMeta(m.meta);
    return {
      id: m.id,
      number: i + 1,
      url: m.url,
      createdAt: m.created_at,
      mode: meta?.mode ?? null,
      instruction: meta?.instructionRaw ?? null,
      instructionEn: meta?.instructionEn ?? null,
      parentNumber: m.parent_id ? (numberOf.get(m.parent_id) ?? null) : null,
      selected: m.id === chosen?.id,
    };
  });
  const selectedVersion = versions.find((v) => v.selected) ?? null;
  const selected = selectedVersion
    ? { ...selectedVersion, pinned: selectedVersion.id === design.selected_media_id }
    : null;

  const photo = parseVenuePhoto(design.venue_photo);
  const beforeAfter = photo
    ? pickBeforeAfter(design.venue_photo, newestFirst, design.selected_media_id)
    : null;
  // A photo no render has dressed yet is still worth seeing on its own.
  const venue = photo
    ? {
        photoUrl: photo.url,
        dressed: beforeAfter
          ? { url: beforeAfter.render.url, number: numberOf.get(beforeAfter.render.id) ?? 0 }
          : null,
      }
    : null;

  // The brief the chosen render was made from, else the newest one stored.
  const chosenRow = chosen ? design.media.find((m) => m.id === chosen.id) : undefined;
  const briefEn =
    metaString(chosenRow?.meta, "briefEn") ??
    newestFirst
      .map((m) => metaString(m.meta, "briefEn"))
      .find((b): b is string => Boolean(b)) ??
    null;

  const decor = chosenRow ? readStoredDecor(chosenRow.meta) : null;
  let plan: DesignBrief["plan"] = null;
  if (decor) {
    const computed = computeDecorPlan(decor, {
      guestCount: design.guest_count,
      size: design.size,
      setting: design.setting,
      market: marketForCountry(opts.country),
    });
    plan = {
      market: computed.market,
      currency: computed.currency,
      lo: computed.totals.lo,
      hi: computed.totals.hi,
      guestCount: computed.guestCount,
      guestCountAssumed: computed.guestCountAssumed,
      tables: computed.tables,
      items: computed.items.length,
    };
  }

  return {
    selected,
    versions,
    venue,
    palette: readPalette(design.palette),
    styleNotes: design.style_notes?.trim() || null,
    briefEn,
    plan,
    planNeedsAnalysis: Boolean(chosenRow) && !decor,
  };
}
