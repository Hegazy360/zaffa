import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, HeartHandshake, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProfessionalSignUpForm } from "@/components/features/auth/professional-signup-form";
import {
  MarketplaceTeaserSection,
  MarketplaceTeaserSkeleton,
} from "@/components/home/marketplace-teaser-section";

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

  return (
    <div className="space-y-8">
      {invitation && (
        <section
          aria-label={t("invitedBadge")}
          className="relative overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/90 via-white/70 to-amber-50/70 p-5 shadow-sm backdrop-blur-sm"
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
              <p className="text-eyebrow font-medium text-rose-700">
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
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
          <Sparkles className="size-3" />
          {t("professionalEyebrow")}
        </div>
        <h1 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl">
          {t("professionalHeadlinePart1")}{" "}
          <span className="italic">{t("professionalHeadlineItalic")}</span>{" "}
          <span className="text-brand-gradient">
            {t("professionalHeadlineHighlight")}
          </span>
        </h1>
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          {t("professionalSubtitle")}
        </p>
      </div>

      {/* Live wall of open briefs, the "why join now" pitch. Anonymized
          server-side; the cards just tease the platform's pulse. Streamed
          via Suspense so the form below is interactive immediately. */}
      <Suspense
        fallback={<MarketplaceTeaserSkeleton variant="planner-signup" />}
      >
        <MarketplaceTeaserSection variant="planner-signup" />
      </Suspense>

      <ProfessionalSignUpForm />

      <div className="rounded-2xl border border-brand-line bg-white/70 p-4 text-sm backdrop-blur-sm">
        <p className="text-muted-foreground">
          {t("areYouAClient")}{" "}
          <Link
            href="/auth/signup"
            className="group inline-flex items-center gap-1 font-medium text-rose-700 underline-offset-4 hover:underline"
          >
            {t("areYouAClientCta")}
            <ArrowRight className="size-3.5 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </p>
      </div>
    </div>
  );
}
