// The versions of a design (F2): every render, oldest first, with the label
// and caption the version strip shows. Pure, so the strip, the panel and
// the tests agree on what "Change 3" means.

import type { ClientMediaMeta } from "@/lib/design-media-meta";

/** The slice of a design's media row this needs (as `getById` returns it). */
export interface VersionMedia {
  id: string;
  type: string;
  url: string;
  parent_id: string | null;
  created_at: string | Date;
  meta: ClientMediaMeta | null;
}

/**
 * What a version is. Renders made from scratch are "original" (or "venue"
 * when they dressed the couple's photo), numbered only when there is more
 * than one of that kind; talked edits are "change", numbered in the order
 * they were made across the whole design.
 */
export type VersionLabel =
  | { kind: "original"; n: number; numbered: boolean }
  | { kind: "venue"; n: number; numbered: boolean }
  | { kind: "change"; n: number };

export interface RenderVersion {
  id: string;
  url: string;
  parentId: string | null;
  label: VersionLabel;
  /** What the couple typed, for a change. */
  caption: string | null;
  /** The line we showed back when the change landed, for a change. */
  confirmation: string | null;
}

function isChange(m: VersionMedia): boolean {
  // A render with a parent is a change by construction (videos, the other
  // children, are not renders); the mode says so too once meta exists.
  return m.meta?.mode === "refine" || m.parent_id !== null;
}

function time(value: string | Date): number {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function buildRenderVersions(
  media: readonly VersionMedia[],
): RenderVersion[] {
  // Oldest first. `getById` returns newest first, and a stable sort on the
  // reversed list keeps rows written in the same millisecond in the order
  // they were written.
  const renders = media
    .filter((m) => m.type === "render")
    .slice()
    .reverse()
    .sort((a, b) => time(a.created_at) - time(b.created_at));

  const originals = renders.filter(
    (m) => !isChange(m) && m.meta?.mode !== "dress_venue",
  ).length;
  const venues = renders.filter(
    (m) => !isChange(m) && m.meta?.mode === "dress_venue",
  ).length;

  let original = 0;
  let venue = 0;
  let change = 0;
  return renders.map((m) => {
    let label: VersionLabel;
    if (isChange(m)) {
      label = { kind: "change", n: ++change };
    } else if (m.meta?.mode === "dress_venue") {
      label = { kind: "venue", n: ++venue, numbered: venues > 1 };
    } else {
      label = { kind: "original", n: ++original, numbered: originals > 1 };
    }
    return {
      id: m.id,
      url: m.url,
      parentId: m.parent_id,
      label,
      caption: isChange(m) ? m.meta?.instructionRaw?.trim() || null : null,
      confirmation: isChange(m) ? m.meta?.confirmation ?? null : null,
    };
  });
}

/**
 * Rows the panel knows about before the design refetch brings them back
 * (a change that just landed), added to the fetched ones without doubles.
 */
export function withPendingVersions<T extends { id: string }>(
  fetched: readonly T[],
  pending: readonly T[],
): T[] {
  const known = new Set(fetched.map((m) => m.id));
  return [...fetched, ...pending.filter((m) => !known.has(m.id))];
}
