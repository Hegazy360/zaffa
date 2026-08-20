"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

// The Whole Wedding (الزفّة الكاملة) — the full-service plan, where Zaffa
// runs the wedding instead of handing the couple a tool. See ZAF-25 (scope
// and pricing), ZAF-26 (name and copy), ZAF-27 (this presentation).
//
// Three decisions here are deliberate and easy to "helpfully" undo:
//
// 1. **It is not in `PACK_SKUS`.** It isn't sold through Stripe and shows no
//    price, so it has no SKU. Adding one risks a single line in
//    `PACK_SKU_ORDER` silently rendering it as a third `TierCard` with a
//    Stripe checkout button — a "Tell us about your wedding" button that
//    opens Stripe is the worst outcome available here.
//
// 2. **It shows no price at all, on purpose.** The fee is 10–15% of a
//    wedding budget, and budgets across our markets differ by ~20× (Egypt
//    EGP 150k–400k, Dubai AED 400k–900k+). Any single figure is wrong
//    somewhere, and a percentage puts the couple's own budget on a meter —
//    the exact anxiety this plan sells relief from. How we actually quote is
//    documented in `docs/pricing-full-service.md`.
//
// 3. **No feature checklist.** The packs use ticks because comparison is
//    their pitch. This plan's pitch is *stop comparing, we've got it*, so it
//    uses a dot-separated run of nouns (the pattern from `begin-section.tsx`)
//    — you can't tick off a list you can only feel the length of.
//
// Its own section rather than a third column in `TierComparisonSection`:
// that component maps off `useTierPricing().ordered` (priced SKUs only),
// hardcodes `md:grid-cols-2`, and its CTA calls `usePackCheckoutAction()`
// straight into Stripe. None of those survive an enquiry-led tier.
// Covered items come from the catalog as one pipe-delimited string rather
// than hardcoded English — they are content, and Arabic needs its own list
// (and its own ordering) rather than a translated word-for-word run.
function parseCovers(raw: string): string[] {
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

const BULLETS = [
  "bullet1",
  "bullet2",
  "bullet3",
  "bullet4",
  "bullet5",
] as const;

export function WholeWeddingSection() {
  const t = useTranslations("marketing.wholeWedding");
  const tp = useTranslations("marketing.pricing");
  const reduce = useReducedMotion();
  const covers = parseCovers(t("covers"));

  return (
    <section
      aria-label={t("aria")}
      className="relative isolate overflow-hidden bg-zinc-950 text-zinc-50"
    >
      {/* Hairline + grain, matching the `contact.tsx` dark plate so the two
          dark surfaces on the site read as the same material. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-7xl bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-25 mix-blend-overlay"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 start-[-10%] h-[34rem] w-[34rem] rounded-full bg-gradient-to-br from-rose-500/20 to-amber-400/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:py-28">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: reduce ? 0 : 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          {/* `rtl:tracking-normal` because wide letter-spacing breaks Arabic
              glyph joining — the letters stop connecting and the word comes
              apart. Live in several older sections; fixed here, raised
              separately rather than folded into this ticket. */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-[0.7rem] uppercase tracking-[0.3em] text-rose-100 backdrop-blur-md rtl:tracking-normal">
            <Sparkles className="h-3.5 w-3.5" />
            {t("eyebrow")}
          </div>
          <h2 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-zinc-300 sm:text-lg">
            {t("tagline")}
          </p>
        </motion.header>

        {/* What's covered — nouns, not ticks. */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: reduce ? 0 : 0.7, delay: 0.1 }}
          className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-zinc-400 sm:gap-x-5"
        >
          {covers.map((item, i) => (
            <span key={item} className="flex items-center gap-4 sm:gap-5">
              <span className="font-display font-light italic tracking-tight">
                {item}
              </span>
              {i < covers.length - 1 && (
                <span
                  aria-hidden
                  className="h-1 w-1 rounded-full bg-rose-400/50"
                />
              )}
            </span>
          ))}
        </motion.div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.ul
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.6, delay: 0.15 }}
            className="space-y-5"
          >
            {BULLETS.map((key) => (
              <li key={key} className="flex gap-3.5">
                <span
                  aria-hidden
                  className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-rose-400 to-amber-300"
                />
                <span className="text-pretty text-base leading-relaxed text-zinc-300">
                  {t(key)}
                </span>
              </li>
            ))}
          </motion.ul>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.6, delay: 0.2 }}
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-md md:p-9"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent"
            />
            <div className="relative">
              {/* The price paragraph. It used to explain why there was no
                  number before refusing to give one; D9 reversed that, so it
                  now makes the same honest argument (Cairo and Dubai are not
                  the same wedding) and resolves it with a published fee per
                  market instead of with silence. The table itself stays on
                  /pricing — three rows per market at the top of a funnel makes
                  the decision harder, not easier. */}
              <p className="text-pretty text-sm leading-relaxed text-zinc-400">
                {t("priceParagraph")}
              </p>
              <Link
                href="/pricing"
                className="group mt-4 inline-flex items-center gap-1.5 text-sm text-rose-300 underline-offset-4 transition-colors hover:text-rose-200 hover:underline"
              >
                {tp("homeLink")}
                <ArrowRight className="size-3.5 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Link>

              <p className="font-display mt-7 text-balance text-2xl font-light leading-snug tracking-tight text-zinc-50">
                {t("reassurance")}
              </p>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-zinc-400">
                {t("reassuranceLong")}
              </p>

              <Button
                size="lg"
                render={<Link href="/enquire" />}
                className="group mt-8 h-12 w-full gap-2 bg-white px-8 text-base text-zinc-950 hover:bg-zinc-100 sm:w-auto"
              >
                {t("cta")}
                <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Button>
              <p className="mt-3 text-xs text-zinc-500">{t("ctaHint")}</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
