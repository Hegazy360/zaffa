import { getTranslations } from "next-intl/server";
import { Building2, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";
import { Rise } from "@/components/motion/rise";

// The one new UI surface in the ZAF-18/ZAF-19 homepage rebrand — sits
// between `HowItWorks` (which ends at the reinstated step 4, "hand it to
// your concierge") and `ShareSection` (demoted to supporting proof). This
// is the "then we take over" payoff: three *parallel* capabilities, not
// more sequential steps, which is why it's centered/un-numbered rather
// than reusing `HowItWorks`'s alternating numbered-step layout.
//
// Icon choices deliberately reuse icons already established elsewhere on
// the page for the same concepts (Users = planner matching, also used in
// `how-it-works.tsx` step 4 and `tier-comparison-section.tsx`; Building2 =
// vetted venue/vendor sourcing, also used in `tier-comparison-section.tsx`).
// `ShieldCheck` is new to the page — the "we're the buffer" idea has no
// existing visual precedent to reuse.
interface Pillar {
  id: "match" | "handle" | "source";
  icon: LucideIcon;
  titleKey: "conciergePillar1Title" | "conciergePillar2Title" | "conciergePillar3Title";
  bodyKey: "conciergePillar1Body" | "conciergePillar2Body" | "conciergePillar3Body";
}

const PILLARS: Pillar[] = [
  {
    id: "match",
    icon: Users,
    titleKey: "conciergePillar1Title",
    bodyKey: "conciergePillar1Body",
  },
  {
    id: "handle",
    icon: ShieldCheck,
    titleKey: "conciergePillar2Title",
    bodyKey: "conciergePillar2Body",
  },
  {
    id: "source",
    icon: Building2,
    titleKey: "conciergePillar3Title",
    bodyKey: "conciergePillar3Body",
  },
];

export async function ConciergePillarsSection() {
  const t = await getTranslations("marketing");

  return (
    <section
      aria-label={t("conciergeAria")}
      className="surface-dark relative isolate overflow-clip"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-[0.15]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 end-[-10%] h-[34rem] w-[34rem] rounded-full bg-gradient-to-br from-rose-500/20 to-amber-400/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-24">
        <header className="mx-auto mb-14 max-w-2xl text-center sm:mb-16">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-eyebrow text-rose-200 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" />
            {t("conciergeEyebrow")}
          </div>
          <h2 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {t("conciergeTitle")}
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
            {t("conciergeSubtitle")}
          </p>
        </header>

        <div className="grid gap-8 sm:grid-cols-3">
          {PILLARS.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <Rise as="div" delay={idx * 0.08} key={pillar.id} className="text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full border border-white/15 bg-gradient-to-br from-rose-500/20 to-amber-400/10 text-rose-200 ring-1 ring-white/10">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <h3 className="font-display mt-4 text-xl font-light tracking-tight">
                  {t(pillar.titleKey)}
                </h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {t(pillar.bodyKey)}
                </p>
              </Rise>
            );
          })}
        </div>
      </div>
    </section>
  );
}
