import Link from "next/link";
import { ArrowRight, HeartHandshake, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProfessionalSignUpForm } from "@/components/features/auth/professional-signup-form";
import { MarketplaceTeaser } from "@/components/home/marketplace-teaser";
import { fetchMarketplaceTeaser } from "@/lib/marketplace-teaser";

export const metadata = {
  title: "Join Zaffa as a Planner or Vendor",
  description:
    "Apply to join Zaffa's professional network of planners and vendors.",
};

interface PageProps {
  searchParams: Promise<{ invitation?: string }>;
}

// Trim, decode, strip control chars + tags, and cap length so an attacker
// can't put a payload into the page through the URL.
function sanitizeInvitation(raw: string | undefined): string | null {
  if (!raw) return null;
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  // Strip anything that smells like markup or control chars.
  value = value.replace(/[\u0000-\u001f\u007f<>{}]/g, "").trim();
  if (!value) return null;
  if (value.length > 80) value = value.slice(0, 80).trim();
  return value;
}

export default async function ProfessionalSignUpPage({ searchParams }: PageProps) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const invitation = sanitizeInvitation(params.invitation);
  const teaser = await fetchMarketplaceTeaser();

  return (
    <div className="space-y-8">
      {invitation && (
        <section
          aria-label={t("invitedBadge")}
          className="relative overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/90 via-white/70 to-amber-50/70 p-5 shadow-sm backdrop-blur-sm dark:border-rose-900/40 dark:from-rose-950/40 dark:via-card/60 dark:to-amber-950/30"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -end-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-rose-300/30 to-amber-300/30 blur-2xl"
          />
          <div className="relative flex items-start gap-3.5">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-600 to-amber-500 text-white shadow-sm">
              <HeartHandshake className="size-4" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-rose-700 dark:text-rose-200">
                {t("invitedBadge")}
              </p>
              <p className="font-display text-xl font-light leading-snug tracking-tight text-foreground">
                {t("invitedGreeting", { businessName: invitation })}
              </p>
              <p className="text-pretty text-sm text-muted-foreground">
                {t("invitedNote")}
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-rose-700 backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          <Sparkles className="size-3" />
          {t("professionalEyebrow")}
        </div>
        <h1 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl">
          {t("professionalHeadlinePart1")}{" "}
          <span className="italic">{t("professionalHeadlineItalic")}</span>{" "}
          <span className="bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 bg-clip-text text-transparent">
            {t("professionalHeadlineHighlight")}
          </span>
        </h1>
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          {t("professionalSubtitle")}
        </p>
      </div>

      {/* Live wall of open briefs — the "why join now" pitch. Anonymized
          server-side; the cards just tease the platform's pulse. */}
      <MarketplaceTeaser data={teaser} variant="planner-signup" />

      <ProfessionalSignUpForm />

      <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-4 text-sm backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/60">
        <p className="text-muted-foreground">
          {t("areYouAClient")}{" "}
          <Link
            href="/auth/signup"
            className="group inline-flex items-center gap-1 font-medium text-rose-700 underline-offset-4 hover:underline dark:text-rose-300"
          >
            {t("areYouAClientCta")}
            <ArrowRight className="size-3.5 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </p>
      </div>
    </div>
  );
}
