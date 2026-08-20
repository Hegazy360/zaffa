"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ImagePlus,
  Palette,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Rise } from "@/components/motion/rise";

// Drop the matching screenshot into `public/home/how-it-works/` with the
// filename listed below, then point the `screenshot` field at it and pass the
// file's intrinsic dimensions (run `file public/home/how-it-works/<file>` if
// you don't know them). The component renders the image at its natural
// aspect ratio so nothing is cropped — no fixed 16:10 box. Until a screenshot
// is wired up the step shows a clean "screenshot coming soon" placeholder.
interface StepDef {
  id: "inspirations" | "palette" | "ai";
  icon: LucideIcon;
  titleKey: "howStep1Title" | "howStep2Title" | "howStep3Title";
  bodyKey: "howStep1Body" | "howStep2Body" | "howStep3Body";
  screenshot: {
    src: string;
    width: number;
    height: number;
  } | null;
  /** Suggested filename for the user when they drop the screenshot in. */
  suggestedFilename: string;
}

const STEPS: StepDef[] = [
  {
    id: "inspirations",
    icon: ImagePlus,
    titleKey: "howStep1Title",
    bodyKey: "howStep1Body",
    screenshot: {
      src: "/home/how-it-works/step-1-inspirations.avif",
      width: 1400,
      height: 795,
    },
    suggestedFilename: "step-1-inspirations.png",
  },
  {
    id: "palette",
    icon: Palette,
    titleKey: "howStep2Title",
    bodyKey: "howStep2Body",
    screenshot: {
      src: "/home/how-it-works/step-2-palette.avif",
      width: 1400,
      height: 924,
    },
    suggestedFilename: "step-2-palette.png",
  },
  {
    id: "ai",
    icon: Sparkles,
    titleKey: "howStep3Title",
    bodyKey: "howStep3Body",
    screenshot: {
      src: "/home/how-it-works/step-3-ai-render.avif",
      width: 1400,
      height: 907,
    },
    suggestedFilename: "step-3-ai-render.png",
  },
];

// There is deliberately no step 4. ZAF-20 reinstated one ("hand it to your
// concierge"), but it restated `ConciergePillarsSection` — which sits
// directly below and says the same thing at more length — and it was the one
// step with no screenshot, so it shipped a dashed placeholder printing an
// internal repo path to visitors. This section now does one job: show the
// free way in. What happens afterwards is the pillars section's job.

export function HowItWorks() {
  const t = useTranslations("marketing");

  return (
    <section
      id="how-it-works"
      aria-label={t("howAria")}
      className="relative isolate scroll-mt-16 overflow-hidden bg-background"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:py-28">
        <header className="mx-auto mb-14 max-w-2xl text-center sm:mb-20">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-rose-200/60 bg-rose-50/70 px-4 py-1.5 text-eyebrow text-rose-700 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" />
            {t("howEyebrow")}
          </div>
          <h2 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {t("howTitle")}
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
            {t("howSubtitle")}
          </p>
        </header>

        <ol className="space-y-20 sm:space-y-28">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            // Alternate which side the screenshot sits on for a calm
            // editorial cadence on desktop. On mobile everything stacks.
            const flip = idx % 2 === 1;
            return (
              <Rise as="li"
          key={step.id}
          className={cn(
                  "grid items-center gap-10 lg:grid-cols-12 lg:gap-16",
                )}
        >
                <div
                  className={cn(
                    "lg:col-span-5",
                    flip ? "lg:order-2" : "lg:order-1",
                  )}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full border border-rose-200/70 bg-gradient-to-br from-rose-50 to-amber-50 text-rose-700 ring-1 ring-rose-200/40">
                      <Icon className="size-4" strokeWidth={2} />
                    </span>
                    <span className="text-eyebrow font-medium text-muted-foreground">
                      {t("howStepLabel", { n: idx + 1, total: STEPS.length })}
                    </span>
                  </div>
                  <h3 className="font-display text-balance text-3xl font-light leading-tight tracking-tight sm:text-4xl">
                    {t(step.titleKey)}
                  </h3>
                  <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
                    {t(step.bodyKey)}
                  </p>
                </div>

                <div
                  className={cn(
                    "lg:col-span-7",
                    flip ? "lg:order-1" : "lg:order-2",
                  )}
                >
                  <Screenshot
                    screenshot={step.screenshot}
                    suggestedFilename={step.suggestedFilename}
                    altKey={step.titleKey}
                  />
                </div>
              </Rise>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

interface ScreenshotProps {
  screenshot: StepDef["screenshot"];
  suggestedFilename: string;
  altKey: StepDef["titleKey"];
}

function Screenshot({ screenshot, suggestedFilename, altKey }: ScreenshotProps) {
  const t = useTranslations("marketing");
  if (screenshot) {
    // Intrinsic-sized image: Next.js infers the aspect from width/height and
    // CSS scales the image to the container's width while preserving that
    // aspect — no 16:10 box, no cropping. `max-h-[640px]` caps the portrait
    // step 4 so it doesn't dominate the rest of the section vertically.
    return (
      <div className="overflow-hidden rounded-2xl border border-brand-line bg-white/70 shadow-glow-lg ring-1 ring-foreground/[0.04] backdrop-blur-sm">
        <Image
          src={screenshot.src}
          alt={t(altKey)}
          width={screenshot.width}
          height={screenshot.height}
          sizes="(min-width: 1024px) 56vw, 92vw"
          className="block h-auto max-h-[640px] w-full object-contain"
        />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={t("howScreenshotPlaceholderAria")}
      className="relative flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-rose-200/70 bg-gradient-to-br from-rose-50/60 via-white/50 to-amber-50/40 p-6 text-center backdrop-blur-sm"
    >
      <div className="grid size-12 place-items-center rounded-full bg-white/80 text-rose-500/80 ring-1 ring-rose-200/60">
        <ImagePlus className="size-5" strokeWidth={1.75} />
      </div>
      <p className="font-display text-base font-medium tracking-tight">
        {t("howScreenshotPlaceholderTitle")}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {t("howScreenshotPlaceholderBody")}
      </p>
      <code className="rounded-md bg-white/70 px-2 py-1 font-mono text-xs text-rose-700 ring-1 ring-rose-200/60">
        public/home/how-it-works/{suggestedFilename}
      </code>
    </div>
  );
}
