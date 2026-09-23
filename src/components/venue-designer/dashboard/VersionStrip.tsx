"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { MediaImage } from "@/components/ui/media-image";
import { cn } from "@/lib/utils";
import type { RenderVersion, VersionLabel } from "./render-versions";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "Original", "Your venue 2", "Change 3", in the couple's language. */
export function versionLabelText(t: Translate, label: VersionLabel): string {
  switch (label.kind) {
    case "change":
      return t("versions.change", { n: label.n });
    case "venue":
      return label.numbered
        ? t("versions.venueN", { n: label.n })
        : t("versions.venue");
    default:
      return label.numbered
        ? t("versions.originalN", { n: label.n })
        : t("versions.original");
  }
}

interface VersionStripProps {
  versions: RenderVersion[];
  /** The version on screen, ringed. Null when none is (the form view). */
  activeId: string | null;
  onSelect: (version: RenderVersion) => void;
  /** Only passed for couples who may delete (a paid pack). */
  onDelete?: (version: RenderVersion) => void;
  deleting?: boolean;
}

/**
 * The design's renders in the order they were made (F2): each talked change
 * is a new version, captioned with what the couple asked for. Tapping one
 * puts it on screen, and the next change applies to it, so any version can
 * be taken in a new direction.
 *
 * One row that scrolls sideways rather than a grid: on a phone the versions
 * stay one thumb-swipe away under the image instead of pushing the change
 * box below the fold.
 */
export function VersionStrip({
  versions,
  activeId,
  onSelect,
  onDelete,
  deleting,
}: VersionStripProps) {
  const t = useTranslations("designer");
  const listRef = useRef<HTMLOListElement>(null);
  const lastId = versions[versions.length - 1]?.id ?? null;

  // A change that just landed is the newest version and goes on screen:
  // bring the end of the row into view so the couple sees it join. Scrolls
  // the row only, never the page, and without smoothing when the couple
  // asked for less motion.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeId || activeId !== lastId) return;
    const rtl = getComputedStyle(list).direction === "rtl";
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo?.({
      // In RTL the far end is a negative scroll offset.
      left: rtl ? -list.scrollWidth : list.scrollWidth,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [activeId, lastId]);

  return (
    <section data-version-strip="" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-eyebrow font-medium text-muted-foreground">
          {t("versions.title")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("versions.hint")}</p>
      </div>
      <ol
        ref={listRef}
        className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 pt-1"
      >
        {versions.map((version) => {
          const active = version.id === activeId;
          const label = versionLabelText(t, version.label);
          return (
            <li
              key={version.id}
              data-version-id={version.id}
              data-version-active={active ? "" : undefined}
              className="relative w-28 shrink-0 snap-start"
            >
              <button
                type="button"
                onClick={() => onSelect(version)}
                aria-current={active ? "true" : undefined}
                aria-label={t("versions.selectAria", { label })}
                className="block w-full rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
              >
                <span
                  className={cn(
                    "relative block aspect-[4/3] overflow-hidden rounded-lg bg-muted",
                    active
                      ? "ring-2 ring-rose-500 ring-offset-2 ring-offset-background"
                      : "ring-1 ring-foreground/10",
                  )}
                >
                  <MediaImage src={version.url} alt="" fill sizes="thumb" />
                </span>
                <span
                  className={cn(
                    "mt-1.5 block truncate text-xs font-medium",
                    active ? "text-rose-700" : "text-foreground",
                  )}
                >
                  {label}
                </span>
                {version.caption ? (
                  <span
                    dir="auto"
                    title={version.caption}
                    className="block truncate text-xs text-muted-foreground"
                  >
                    {version.caption}
                  </span>
                ) : null}
              </button>
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(version)}
                  disabled={deleting}
                  aria-label={t("versions.deleteAria", { label })}
                  // 32px to look at, 44px to hit: the pseudo-element pads
                  // the target without covering the thumbnail's own tap.
                  className="absolute end-1 top-2 grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm before:absolute before:-inset-1.5 before:content-[''] hover:bg-black/80 disabled:opacity-40"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
