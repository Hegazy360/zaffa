import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isFlagEnabled } from "@/lib/flags";
import {
  VenueDressedExamples,
  type VenueExample,
} from "@/components/home/venue-dressed-examples";

// "Your venue, dressed" (F1): the homepage shows what the designer now does
// with a photo of the couple's own hall or garden. Sits directly after the
// sample studio hero, which shows a sample wedding; this shows theirs.
//
// A server component; only the before/after slider and its example switch
// hydrate (`VenueDressedExamples`). Below the fold, so nothing here is
// `priority`: the images load lazily as the reader scrolls to them.
//
// Credits. Both "before" photos are from Unsplash under the Unsplash
// License: the hall by Vishal Sinha, the garden by Bob Osias. Both "after"
// images were generated from those photos with openai/gpt-image-2.5-sunburst
// (the venue model) during the September 2026 model bake-off, then cropped
// to the same frame as their "before" so the slider lines up.
const EXAMPLES = [
  {
    id: "hall",
    before: "/home/venue/hall-before.avif",
    after: "/home/venue/hall-after.avif",
    width: 1600,
    height: 900,
  },
  {
    id: "garden",
    before: "/home/venue/lawn-before.avif",
    after: "/home/venue/lawn-after.avif",
    width: 1400,
    height: 1050,
  },
] as const;

export async function VenueDressedSection() {
  // The designer hides the venue photo when the feature is switched off,
  // so the homepage must not promise it either.
  if (!isFlagEnabled("venuePhoto")) return null;
  const t = await getTranslations("marketing.venueDressed");

  const copy = {
    hall: {
      tab: t("tabHall"),
      beforeAlt: t("hallBeforeAlt"),
      afterAlt: t("hallAfterAlt"),
    },
    garden: {
      tab: t("tabGarden"),
      beforeAlt: t("gardenBeforeAlt"),
      afterAlt: t("gardenAfterAlt"),
    },
  };
  const examples: VenueExample[] = EXAMPLES.map((e) => ({
    id: e.id,
    tab: copy[e.id].tab,
    before: { src: e.before, alt: copy[e.id].beforeAlt },
    after: { src: e.after, alt: copy[e.id].afterAlt },
    width: e.width,
    height: e.height,
  }));

  return (
    <section
      id="your-venue"
      aria-label={t("aria")}
      data-venue-dressed-section=""
      className="relative isolate scroll-mt-16 overflow-clip border-b border-brand-line bg-gradient-to-b from-background via-rose-50/30 to-background"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-5xl px-4 py-20 sm:py-24">
        <header className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-rose-200/60 bg-rose-50/70 px-4 py-1.5 text-eyebrow text-rose-700 backdrop-blur-md">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {t("eyebrow")}
          </div>
          <h2 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
        </header>

        <VenueDressedExamples
          examples={examples}
          tabsLabel={t("tabsLabel")}
          beforeLabel={t("before")}
          afterLabel={t("after")}
          compareLabel={t("compareLabel")}
        />

        <div className="mt-10 flex flex-col items-center gap-3">
          <Button
            variant="cta"
            size="xl"
            render={<Link href="/venue-designer/new#step=basics" />}
            data-venue-dressed-cta=""
          >
            {t("cta")}
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </Button>
          <p className="text-xs text-muted-foreground">{t("note")}</p>
        </div>
      </div>
    </section>
  );
}
