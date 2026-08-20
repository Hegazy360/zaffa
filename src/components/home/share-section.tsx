import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { FileDown, Globe, Heart, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Rise } from "@/components/motion/rise";

// Sits between "How it works" and the marketplace teaser on the home page.
// Closes the loop on the four steps by showing the *artefacts* a couple
// walks away with, a private microsite at zaffa.ai/v/<slug> and a
// printable lookbook PDF, and the audiences they're designed for
// (family + friends + every planner they speak to).

const MICROSITE_PREVIEW_IMAGE = "/home/examples/hero.avif";
const MICROSITE_THUMB_IMAGES = [
  "/home/examples/collage-1.avif",
  "/home/examples/collage-2.avif",
  "/home/examples/collage-3.avif",
  "/home/examples/collage-4.avif",
] as const;

export async function ShareSection() {
  const t = await getTranslations("marketing");

  return (
    <section
      aria-label={t("shareAria")}
      className="relative isolate overflow-clip border-y border-brand-line bg-gradient-to-b from-rose-50/40 via-background to-amber-50/30"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 end-[-12%] h-[32rem] w-[32rem] rounded-full bg-gradient-to-br from-rose-200/35 to-amber-200/25 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-24">
        <header className="mx-auto mb-14 max-w-2xl text-center sm:mb-20">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-rose-200/60 bg-rose-50/70 px-4 py-1.5 text-eyebrow text-rose-700 backdrop-blur-md">
            <Heart className="h-3.5 w-3.5" />
            {t("shareEyebrow")}
          </div>
          {/* Demoted vs. HowItWorks/hero scale (text-4xl/5xl), this
              section is now supporting proof, not a primary sell. Closer
              to TierComparisonSection's heading scale (clamp(1.875rem,
              4vw,2.75rem)) than to the primary-narrative sections above
              it. Content unchanged, proportion only - see ZAF-18/ZAF-19. */}
          <h2 className="font-display text-balance text-3xl font-light leading-tight tracking-tight sm:text-4xl">
            {t("shareTitlePart1")}{" "}
            <span className="italic">{t("shareTitleItalic")}</span>{" "}
            {t("shareTitleTail")}
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
            {t("shareSubtitle")}
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <ArtefactCard
            kind="microsite"
            label={t("shareMicrositeLabel")}
            title={t("shareMicrositeTitle")}
            body={t("shareMicrositeBody")}
            bullets={[
              t("shareMicrositeBullet1"),
              t("shareMicrositeBullet2"),
            ]}
          />
          <ArtefactCard
            kind="lookbook"
            label={t("shareLookbookLabel")}
            title={t("shareLookbookTitle")}
            body={t("shareLookbookBody")}
            bullets={[
              t("shareLookbookBullet1"),
              t("shareLookbookBullet2"),
            ]}
          />
        </div>

        <Rise as="div" delay={0.2}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-sm text-muted-foreground sm:mt-16"
        >
          <span className="inline-flex items-center gap-2">
            <Users className="size-4 text-rose-600" />
            <span className="text-eyebrow font-medium text-rose-700/80">
              {t("shareAudienceEyebrow")}
            </span>
          </span>
          <span className="font-display italic font-light tracking-tight text-foreground/85">
            {t("shareAudienceFamily")}
          </span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-rose-400/50" />
          <span className="font-display italic font-light tracking-tight text-foreground/85">
            {t("shareAudienceFriends")}
          </span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-rose-400/50" />
          <span className="font-display italic font-light tracking-tight text-foreground/85">
            {t("shareAudiencePlanners")}
          </span>
        </Rise>
      </div>
    </section>
  );
}

interface ArtefactCardProps {
  kind: "microsite" | "lookbook";
  label: string;
  title: string;
  body: string;
  bullets: readonly string[];
}

function ArtefactCard({
  kind,
  label,
  title,
  body,
  bullets,
}: ArtefactCardProps) {
  const Icon = kind === "microsite" ? Globe : FileDown;
  return (
    <Rise as="article"
          className="group relative flex flex-col overflow-hidden rounded-3xl border border-brand-line bg-white/70 p-6 shadow-glow-lg backdrop-blur-sm sm:p-8"
        >
      <div className="mb-6">
        {kind === "microsite" ? <MicrositePreview /> : <LookbookPreview />}
      </div>

      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full border border-rose-200/70 bg-gradient-to-br from-rose-50 to-amber-50 text-rose-700 ring-1 ring-rose-200/40">
          <Icon className="size-3.5" strokeWidth={2} />
        </span>
        <span className="text-eyebrow font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <h3 className="font-display mt-3 text-balance text-2xl font-light leading-tight tracking-tight sm:text-3xl">
        {title}
      </h3>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
        {body}
      </p>
      <ul className="mt-5 space-y-2 text-sm">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2.5">
            <Sparkles
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0 text-rose-600"
            />
            <span className="text-foreground/80">{bullet}</span>
          </li>
        ))}
      </ul>
    </Rise>
  );
}

// CSS-only browser-frame mock for the microsite. We deliberately avoid a
// real screenshot so this stays in sync with the live microsite as it
// evolves - the value being communicated is "a private, beautiful link",
// not pixel-accurate UI.
function MicrositePreview() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-line bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60 ring-1 ring-foreground/[0.04]">
      <div className="flex items-center gap-2 border-b border-brand-line bg-white/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-rose-300/70" />
          <span className="size-2 rounded-full bg-amber-300/70" />
          <span className="size-2 rounded-full bg-emerald-300/70" />
        </div>
        <div className="flex flex-1 items-center gap-1.5 truncate rounded-md bg-rose-50/70 px-2.5 py-1 text-xs font-mono text-rose-700/80">
          <Globe className="size-3 shrink-0" strokeWidth={2} />
          <span className="truncate">zaffa.ai/v/jasmine-omar</span>
        </div>
      </div>
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={MICROSITE_PREVIEW_IMAGE}
          alt=""
          fill
          sizes="(min-width: 1024px) 28vw, 90vw"
          className="object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"
        />
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-eyebrow font-medium text-white/85">
              Wedding Vision Pack
            </p>
            <p className="font-display mt-1 truncate text-lg font-light italic leading-tight tracking-tight text-white">
              Jasmine &amp; Omar
            </p>
          </div>
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  "size-1.5 rounded-full",
                  i === 0 ? "bg-white" : "bg-white/40",
                )}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 p-3">
        {MICROSITE_THUMB_IMAGES.map((src) => (
          <div
            key={src}
            className="relative aspect-square overflow-hidden rounded-md bg-rose-100/60 ring-1 ring-foreground/[0.04]"
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Stylized A4-ish PDF cover with a back page peeking, communicates
// "printable lookbook" without committing to a specific PDF screenshot.
function LookbookPreview() {
  return (
    <div className="relative aspect-[16/10] w-full">
      <div
        aria-hidden
        className="absolute end-[6%] top-[8%] h-[88%] w-[58%] rotate-[4deg] rounded-xl border border-brand-line bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60 shadow-glow"
      />
      <div className="absolute start-[4%] top-[4%] flex h-[92%] w-[62%] -rotate-[2deg] flex-col overflow-hidden rounded-xl border border-brand-line bg-gradient-to-br from-white via-rose-50/40 to-amber-50/40 p-4 shadow-glow-lg ring-1 ring-foreground/[0.04] sm:p-5">
        <p className="text-eyebrow font-medium text-rose-700/80 sm:text-xs">
          Wedding Vision Pack
        </p>
        <p className="font-display mt-2 text-2xl font-light leading-[1.05] tracking-tight sm:text-3xl">
          Jasmine
          <br />
          &amp; Omar
        </p>
        <p className="font-display mt-1 text-xs italic font-light text-rose-600 sm:text-xs">
          A wedding, visualized.
        </p>
        <div className="champagne-hairline mt-3 h-px w-12" aria-hidden />
        <div className="mt-3 flex items-center gap-1.5">
          {[
            "#fff7f0",
            "#f5d4c0",
            "#e8a796",
            "#9f1239",
            "#1f1a17",
          ].map((c) => (
            <span
              key={c}
              className="size-3 rounded-full ring-1 ring-foreground/10"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between text-eyebrow font-medium text-muted-foreground sm:text-xs">
          <span>Zaffa</span>
          <span>PDF · 12 pages</span>
        </div>
      </div>
      <span className="absolute bottom-3 end-3 inline-flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2.5 py-1 text-eyebrow font-medium text-white shadow-glow-sm backdrop-blur-sm sm:text-xs">
        <FileDown className="size-3" strokeWidth={2.25} />
        PDF
      </span>
    </div>
  );
}
