"use client";

import Image from "next/image";
import { useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useTranslations } from "next-intl";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Tailwind's `lg` breakpoint. We render the GSAP scrolly experience only at
// or above this width and fall back to a static stacked variant on phones
// and tablets — the pinned aspect-[5/2] stage is unusable below it.
const DESKTOP_MQ = "(min-width: 1024px)";

/* -------------------------------------------------------------------------- */
/* Storyboard data                                                             */
/* -------------------------------------------------------------------------- */

const PALETTE = [
  { hex: "#FEF6EC", nameKey: "paletteCreamLinen" as const },
  { hex: "#F8D9CB", nameKey: "palettePetal" as const },
  { hex: "#E89AA0", nameKey: "paletteRoseHush" as const },
  { hex: "#F8BF77", nameKey: "paletteWarmAmber" as const },
  { hex: "#8A3A45", nameKey: "paletteBordeaux" as const },
];

// Each reference demonstrates one note in the palette — cream linen, petal,
// rose hush, warm amber, bordeaux, and a soft romantic detail. Pinterest pins
// (high-res `originals/`) carry more curatorial weight than generic stock.
const REFERENCES = [
  // Cream linen — long candlelit table
  "https://images.unsplash.com/photo-1773370812331-4e534dcf0ce1?auto=format&fit=crop&w=900&q=90",
  // Petal — pink-and-cream rose bouquet
  "https://images.unsplash.com/photo-1771142480968-6036543055f7?auto=format&fit=crop&w=900&q=90",
  // Rose hush — ivory and blush perfection (Pinterest)
  "https://i.pinimg.com/originals/59/27/d4/5927d4b4e95a13f24846213d44ff37cc.jpg",
  // Warm amber — garden reception lit by warm string lights (Pinterest)
  "https://i.pinimg.com/originals/4b/f0/73/4bf0736caf0c455937cfc8e9f2ba68a7.jpg",
  // Bordeaux — cream and burgundy bouquet
  "https://images.unsplash.com/photo-1614469260957-c034c3e48481?auto=format&fit=crop&w=900&q=90",
  // Romantic detail — white roses with soft greenery
  "https://images.unsplash.com/photo-1772688168280-2deeaa872691?auto=format&fit=crop&w=900&q=90",
];

// Outdoor tablescape — the "AI render" the user sees in steps 3 & 4.
// Matches the homepage palette and answers "show me what an outdoor event looks like."
const RENDER_IMAGE =
  "https://images.unsplash.com/photo-1758810742443-b82f48355828?auto=format&fit=crop&w=2400&q=85";

const STEPS = [
  { eyebrow: "01", titleKey: "step01Title", subKey: "step01Sub" },
  { eyebrow: "02", titleKey: "step02Title", subKey: "step02Sub" },
  { eyebrow: "03", titleKey: "step03Title", subKey: "step03Sub" },
  { eyebrow: "04", titleKey: "step04Title", subKey: "step04Sub" },
] as const;

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function ScrollyDemo() {
  const t = useTranslations("marketing");
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const captionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stepBadgeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const swatchRefs = useRef<(HTMLDivElement | null)[]>([]);
  const refRefs = useRef<(HTMLDivElement | null)[]>([]);
  const renderImgRef = useRef<HTMLDivElement>(null);
  const videoChromeRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reduce) return;
      const section = sectionRef.current;
      if (!section) return;
      if (typeof window === "undefined") return;

      // Use gsap.matchMedia so the ScrollTrigger pin is created only at >=lg
      // and is automatically torn down (with its pin spacer) when the viewport
      // drops below — otherwise resizing from desktop to mobile leaves a 400vh
      // pin spacer in the page and the user feels a long "paused" scroll on
      // mobile even though all the mobile content has already been seen.
      const mm = gsap.matchMedia();
      mm.add(DESKTOP_MQ, () => {
        gsap.set(stepRefs.current, { opacity: 0 });
        gsap.set(stepRefs.current[0], { opacity: 1 });
        gsap.set(captionRefs.current, { opacity: 0, y: 18 });
        gsap.set(captionRefs.current[0], { opacity: 1, y: 0 });

        gsap.set(swatchRefs.current, { y: 60, scale: 0.5, opacity: 0 });
        gsap.set(refRefs.current, { y: 50, scale: 0.85, opacity: 0 });
        gsap.set(renderImgRef.current, { scale: 1.06, opacity: 0 });
        gsap.set(videoChromeRef.current, { opacity: 0 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "+=400%",
            pin: true,
            scrub: 0.5,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              if (progressRef.current) {
                progressRef.current.style.transform = `scaleX(${self.progress})`;
              }
              const idx = Math.min(
                3,
                Math.max(0, Math.floor(self.progress * 3.999)),
              );
              stepBadgeRefs.current.forEach((el, i) => {
                if (!el) return;
                el.dataset.active = i === idx ? "true" : "false";
              });
            },
          },
        });

        // STEP 1 enter
        tl.to(
          swatchRefs.current,
          {
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.10,
            stagger: 0.02,
            ease: "back.out(1.5)",
          },
          0.02,
        );

        // 1 → 2
        tl.to(stepRefs.current[0], { opacity: 0, duration: 0.03 }, 0.22);
        tl.to(captionRefs.current[0], { opacity: 0, y: -18, duration: 0.03 }, 0.22);
        tl.to(stepRefs.current[1], { opacity: 1, duration: 0.03 }, 0.26);
        tl.to(captionRefs.current[1], { opacity: 1, y: 0, duration: 0.03 }, 0.26);
        tl.to(
          refRefs.current,
          {
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.10,
            stagger: 0.022,
            ease: "power3.out",
          },
          0.28,
        );

        // 2 → 3
        tl.to(stepRefs.current[1], { opacity: 0, duration: 0.03 }, 0.48);
        tl.to(captionRefs.current[1], { opacity: 0, y: -18, duration: 0.03 }, 0.48);
        tl.to(stepRefs.current[2], { opacity: 1, duration: 0.03 }, 0.52);
        tl.to(captionRefs.current[2], { opacity: 1, y: 0, duration: 0.03 }, 0.52);
        tl.to(
          renderImgRef.current,
          { scale: 1, opacity: 1, duration: 0.12, ease: "power3.out" },
          0.54,
        );

        // 3 → 4
        tl.to(stepRefs.current[2], { opacity: 0, duration: 0.03 }, 0.74);
        tl.to(captionRefs.current[2], { opacity: 0, y: -18, duration: 0.03 }, 0.74);
        tl.to(stepRefs.current[3], { opacity: 1, duration: 0.03 }, 0.78);
        tl.to(captionRefs.current[3], { opacity: 1, y: 0, duration: 0.03 }, 0.78);
        tl.to(
          videoChromeRef.current,
          { opacity: 1, duration: 0.10, ease: "power2.out" },
          0.76,
        );
      });
    },
    { scope: sectionRef, dependencies: [reduce] },
  );

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden bg-gradient-to-b from-rose-50/70 via-background to-background text-foreground"
      aria-label={t("scrollyAriaLabel")}
    >
      {/* Atmosphere — same DNA as the rest of the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 start-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/35 to-amber-200/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute end-[-10%] top-1/3 h-[24rem] w-[24rem] rounded-full bg-gradient-to-br from-amber-200/25 to-rose-200/20 blur-3xl"
      />
      {/* champagne hairline at the top tying us to the section above */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-7xl champagne-hairline"
      />

      {/* ============================================================ */}
      {/* MOBILE/TABLET: static stacked variant. No pin, no scroll-link. */}
      {/* ============================================================ */}
      <div className="relative z-10 lg:hidden">
        <MobileStorySection t={t} />
      </div>

      {/* ============================================================ */}
      {/* DESKTOP: pinned scrolly experience.                           */}
      {/* ============================================================ */}
      <div className="hidden lg:block">

      {/* HUD: eyebrow + step numerals + progress hairline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-6 pt-6 sm:pt-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-[0.7rem] uppercase tracking-[0.3em]">
          <span className="text-rose-700">{t("scrollyEyebrow")}</span>
          <span className="text-muted-foreground">
            {STEPS.map((s, i) => (
              <span
                key={s.eyebrow}
                ref={(el) => {
                  stepBadgeRefs.current[i] = el;
                }}
                data-active={i === 0 ? "true" : "false"}
                className="mx-1 transition-colors data-[active=true]:text-rose-700"
              >
                {s.eyebrow}
              </span>
            ))}
            <span className="ms-2">{t("scrollyOf")}</span>
          </span>
        </div>
        <div className="relative mx-auto mt-3 h-px max-w-6xl bg-rose-900/10">
          <span
            ref={progressRef}
            aria-hidden
            className="absolute inset-y-0 start-0 end-0 origin-left scale-x-0 bg-gradient-to-r from-rose-500 to-amber-500"
          />
        </div>
      </div>

      {/* Pinned stage. Fixed-aspect "screen frame" centered in viewport. */}
      <div className="relative flex h-screen w-full items-center justify-center px-4 pb-44 pt-28 sm:px-8 md:px-12">
        <div className="relative aspect-[5/2] w-full max-w-5xl">
          {/* ============ STEP 1: PALETTE ============================== */}
          <div
            ref={(el) => {
              stepRefs.current[0] = el;
            }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ opacity: 0 }}
          >
            <div className="flex items-end justify-center gap-3 sm:gap-4">
              {PALETTE.map((p, i) => (
                <div
                  key={p.hex}
                  ref={(el) => {
                    swatchRefs.current[i] = el;
                  }}
                  className="flex shrink-0 flex-col items-center gap-2.5 will-change-transform"
                  style={{ opacity: 0 }}
                >
                  <span
                    className="h-28 w-20 rounded-[1.25rem] shadow-xl shadow-rose-900/20 ring-1 ring-rose-900/15 sm:h-36 sm:w-24"
                    style={{ backgroundColor: p.hex }}
                  />
                  <span className="font-mono text-[0.6rem] tracking-wide text-foreground/80">
                    {p.hex}
                  </span>
                  <span className="text-[0.55rem] uppercase tracking-[0.25em] text-muted-foreground">
                    {t(p.nameKey)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ============ STEP 2: MOODBOARD ============================ */}
          <div
            ref={(el) => {
              stepRefs.current[1] = el;
            }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            style={{ opacity: 0 }}
          >
            <div className="flex items-center gap-2 rounded-2xl border border-rose-900/10 bg-white/70 p-2.5 shadow-sm shadow-rose-900/5 backdrop-blur-md">
              {PALETTE.map((p) => (
                <span
                  key={p.hex}
                  className="h-8 w-8 rounded-lg ring-1 ring-rose-900/10"
                  style={{ backgroundColor: p.hex }}
                />
              ))}
            </div>
            <div className="grid w-full max-w-5xl grid-cols-6 gap-3">
              {REFERENCES.map((src, i) => (
                <div
                  key={src}
                  ref={(el) => {
                    refRefs.current[i] = el;
                  }}
                  className="relative aspect-[3/4] overflow-hidden rounded-2xl shadow-lg shadow-rose-900/15 ring-1 ring-rose-900/10 will-change-transform"
                  style={{ opacity: 0 }}
                >
                  <Image
                    src={src}
                    alt={t("scrollyRefAlt", {
                      palette: t(
                        PALETTE[i % PALETTE.length].nameKey,
                      ).toLowerCase(),
                    })}
                    fill
                    sizes="(min-width: 1024px) 16vw, 33vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ============ STEP 3 + 4: RENDER (and video chrome) ======== */}
          {[2, 3].map((stepIdx) => (
            <div
              key={stepIdx}
              ref={(el) => {
                stepRefs.current[stepIdx] = el;
              }}
              className="absolute inset-0"
              style={{ opacity: 0 }}
            >
              {/* Sidebar — single compact "inputs" card with palette + refs */}
              <aside className="absolute start-0 top-0 w-[24%] rounded-2xl border border-rose-900/10 bg-white/75 p-2.5 shadow-md shadow-rose-900/10 backdrop-blur-md">
                <p className="text-[0.55rem] uppercase tracking-[0.25em] text-muted-foreground">
                  {t("scrollyInputs")}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  {PALETTE.map((p) => (
                    <span
                      key={p.hex}
                      className="h-4 flex-1 rounded-sm ring-1 ring-rose-900/10"
                      style={{ backgroundColor: p.hex }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex gap-1">
                  {REFERENCES.slice(0, 4).map((src) => (
                    <div
                      key={src}
                      className="relative aspect-square w-full overflow-hidden rounded-sm ring-1 ring-rose-900/10"
                    >
                      <Image
                        src={src}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </aside>

              {/* Render canvas */}
              <div className="absolute bottom-0 start-[28%] end-0 top-0">
                <div
                  ref={stepIdx === 2 ? renderImgRef : undefined}
                  className="absolute inset-0 overflow-hidden rounded-3xl shadow-2xl shadow-rose-900/20 ring-1 ring-rose-900/10 will-change-transform"
                  style={stepIdx === 2 ? { opacity: 0 } : undefined}
                >
                  <Image
                    src={RENDER_IMAGE}
                    alt={t("scrollyRenderAlt")}
                    fill
                    sizes="(min-width: 1024px) 70vw, 100vw"
                    className={
                      stepIdx === 3 ? "scale-105 object-cover" : "object-cover"
                    }
                  />

                  {/* Step 4 only: video chrome layered over the render */}
                  {stepIdx === 3 && (
                    <div
                      ref={videoChromeRef}
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{ opacity: 0 }}
                    >
                      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/55 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
                      <div className="absolute start-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/35 px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.25em] text-white backdrop-blur-md">
                        <span className="relative inline-flex h-1.5 w-1.5">
                          <span className="absolute inset-0 animate-ping rounded-full bg-rose-300 opacity-75" />
                          <span className="relative h-1.5 w-1.5 rounded-full bg-rose-300" />
                        </span>
                        {t("scrollyLivePreview")}
                      </div>
                      <div className="absolute end-5 top-5 rounded-md border border-white/25 bg-black/35 px-2.5 py-1 font-mono text-[0.65rem] tracking-wide text-white/85 backdrop-blur-md">
                        01:24 / 08:00
                      </div>
                      <div className="absolute inset-x-5 bottom-5 flex items-center gap-3">
                        <span className="font-mono text-[0.6rem] tracking-wide text-white/70">
                          00:01:24
                        </span>
                        <div className="relative h-1 flex-1 rounded-full bg-white/20">
                          <div className="h-1 w-[18%] rounded-full bg-gradient-to-r from-rose-300 to-amber-200" />
                        </div>
                        <span className="font-mono text-[0.6rem] tracking-wide text-white/70">
                          00:08:00
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Caption rail (bottom of pinned area) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-12 sm:px-8 md:px-12">
        <div className="relative mx-auto h-32 max-w-4xl">
          {STEPS.map((s, i) => (
            <div
              key={s.eyebrow}
              ref={(el) => {
                captionRefs.current[i] = el;
              }}
              className="absolute inset-0 will-change-transform"
              style={{ opacity: 0 }}
            >
              <p className="text-[0.7rem] uppercase tracking-[0.3em] text-rose-700">
                {t("scrollyStepLabel", { n: s.eyebrow })}
              </p>
              <h3 className="mt-3 font-display text-balance text-3xl font-light leading-[1.05] tracking-tight text-foreground md:text-5xl">
                {t(s.titleKey)}
              </h3>
              <p className="mt-3 max-w-xl text-pretty text-sm text-muted-foreground md:text-base">
                {t(s.subKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile / tablet stacked variant                                            */
/* -------------------------------------------------------------------------- */

function MobileStorySection({
  t,
}: {
  t: ReturnType<typeof useTranslations<"marketing">>;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <p className="text-[0.7rem] uppercase tracking-[0.3em] text-rose-700">
        {t("scrollyEyebrow")}
      </p>
      <div aria-hidden className="champagne-hairline mt-3 h-px w-full" />

      <div className="mt-10 space-y-16">
        {STEPS.map((s, idx) => (
          <article key={s.eyebrow} className="space-y-5">
            <header>
              <p className="text-[0.7rem] uppercase tracking-[0.3em] text-rose-700">
                {t("scrollyStepLabel", { n: s.eyebrow })}
              </p>
              <h3 className="mt-3 font-display text-balance text-3xl font-light leading-[1.1] tracking-tight text-foreground sm:text-4xl">
                {t(s.titleKey)}
              </h3>
              <p className="mt-3 max-w-xl text-pretty text-sm text-muted-foreground sm:text-base">
                {t(s.subKey)}
              </p>
            </header>

            {idx === 0 && <MobilePaletteVisual t={t} />}
            {idx === 1 && <MobileMoodboardVisual t={t} />}
            {idx === 2 && <MobileRenderVisual t={t} />}
            {idx === 3 && <MobileVideoVisual t={t} />}
          </article>
        ))}
      </div>
    </div>
  );
}

function MobilePaletteVisual({
  t,
}: {
  t: ReturnType<typeof useTranslations<"marketing">>;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {PALETTE.map((p) => (
        <div key={p.hex} className="flex min-w-0 flex-col items-center gap-2">
          <span
            className="aspect-[2/3] w-full rounded-2xl shadow-xl shadow-rose-900/20 ring-1 ring-rose-900/15"
            style={{ backgroundColor: p.hex }}
          />
          <span className="truncate text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground">
            {t(p.nameKey)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MobileMoodboardVisual({
  t,
}: {
  t: ReturnType<typeof useTranslations<"marketing">>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl border border-rose-900/10 bg-white/70 p-2.5 shadow-sm shadow-rose-900/5 backdrop-blur-md">
        {PALETTE.map((p) => (
          <span
            key={p.hex}
            className="h-7 flex-1 rounded-lg ring-1 ring-rose-900/10"
            style={{ backgroundColor: p.hex }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {REFERENCES.map((src, i) => (
          <div
            key={src}
            className="relative aspect-[3/4] overflow-hidden rounded-xl shadow-md shadow-rose-900/15 ring-1 ring-rose-900/10"
          >
            <Image
              src={src}
              alt={t("scrollyRefAlt", {
                palette: t(PALETTE[i % PALETTE.length].nameKey).toLowerCase(),
              })}
              fill
              sizes="33vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileRenderVisual({
  t,
}: {
  t: ReturnType<typeof useTranslations<"marketing">>;
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-2xl shadow-rose-900/20 ring-1 ring-rose-900/10">
      <Image
        src={RENDER_IMAGE}
        alt={t("scrollyRenderAlt")}
        fill
        sizes="100vw"
        className="object-cover"
      />
    </div>
  );
}

function MobileVideoVisual({
  t,
}: {
  t: ReturnType<typeof useTranslations<"marketing">>;
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-2xl shadow-rose-900/20 ring-1 ring-rose-900/10">
      <Image
        src={RENDER_IMAGE}
        alt={t("scrollyRenderAlt")}
        fill
        sizes="100vw"
        className="scale-105 object-cover"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute start-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/35 px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.25em] text-white backdrop-blur-md">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-300 opacity-75" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-rose-300" />
          </span>
          {t("scrollyLivePreview")}
        </div>
        <div className="absolute end-3 top-3 rounded-md border border-white/25 bg-black/35 px-2.5 py-1 font-mono text-[0.65rem] tracking-wide text-white/85 backdrop-blur-md">
          01:24 / 08:00
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
          <span className="font-mono text-[0.55rem] tracking-wide text-white/70">
            00:01:24
          </span>
          <div className="relative h-1 flex-1 rounded-full bg-white/20">
            <div className="h-1 w-[18%] rounded-full bg-gradient-to-r from-rose-300 to-amber-200" />
          </div>
          <span className="font-mono text-[0.55rem] tracking-wide text-white/70">
            00:08:00
          </span>
        </div>
      </div>
    </div>
  );
}
