import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Sparkles, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export const dynamic = "force-dynamic";

// One curated editorial image, shared with the marketing hero so the auth
// surfaces feel like the same atelier the visitor just left. Imported here
// (instead of fetched as a remote URL) keeps the asset list discoverable.
const ATELIER_IMAGE =
  "https://i.pinimg.com/originals/c1/c7/e8/c1c7e8c387cdadcc45d435e716de3e97.jpg";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tBrand = await getTranslations("brand");
  const tAuth = await getTranslations("auth");
  const tNav = await getTranslations("nav");

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-gradient-to-b from-rose-50/60 via-background to-background dark:from-rose-950/20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -end-32 h-[36rem] w-[36rem] rounded-full bg-gradient-to-br from-rose-200/40 to-amber-200/30 blur-3xl dark:from-rose-900/20 dark:to-amber-900/10"
      />

      {/* Slim brand-only top bar: keeps a "way out" + locale switcher without
          the full marketing nav competing with the editorial framing. */}
      <header className="relative z-20 flex items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group inline-flex items-center gap-2"
          aria-label={tNav("ariaHome")}
        >
          <ArrowLeft className="size-4 text-muted-foreground transition-colors rtl:-scale-x-100 group-hover:text-foreground" />
          <span className="font-display bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 bg-clip-text text-2xl font-light italic tracking-tight text-transparent">
            {tBrand("name")}
          </span>
          <span className="font-arabic hidden text-sm text-muted-foreground sm:inline">
            {tBrand("nameArabic")}
          </span>
        </Link>
        <LocaleSwitcher />
      </header>

      <div className="relative z-10 grid flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Left atelier panel — desktop only. Anchored editorial image with a
            rose/amber wash, brand mark, tagline and the same 4.9★ proof block
            from the marketing hero. */}
        <aside className="relative hidden overflow-hidden lg:block">
          <Image
            src={ATELIER_IMAGE}
            alt="A romantic alfresco wedding reception in cream and rose tones"
            fill
            sizes="50vw"
            priority
            className="object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-rose-950/70 via-rose-900/45 to-amber-900/55"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grain-bg opacity-30 mix-blend-overlay"
          />

          <div className="relative flex h-full flex-col justify-between p-10 text-white">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs uppercase tracking-[0.18em] backdrop-blur-md">
              <Sparkles className="size-3.5" />
              {tAuth("atelierEyebrow")}
            </div>

            <div className="space-y-6">
              <h2 className="font-display text-balance text-[clamp(2.25rem,3.5vw,3.5rem)] font-light leading-[1] tracking-tight">
                {tAuth("atelierHeadlinePart1")}{" "}
                <span className="italic">{tAuth("atelierHeadlineItalic")}</span>{" "}
                <span className="font-arabic font-medium">
                  {tBrand("nameArabic")}
                </span>
                .
              </h2>
              <p className="max-w-md text-pretty text-sm text-white/80 md:text-base">
                {tAuth("atelierSubtitle")}
              </p>

              <div className="flex items-center gap-3 pt-2">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="size-4 fill-amber-300 text-amber-300"
                    />
                  ))}
                </div>
                <span className="text-sm font-semibold">4.9</span>
                <span className="text-xs text-white/70">
                  {tAuth("atelierProof")}
                </span>
              </div>
            </div>

            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-white/60">
              {tBrand("tagline")}
            </p>
          </div>
        </aside>

        {/* Right form panel — children render the page-specific eyebrow,
            headline and form. Layout owns the spacing + atmosphere. */}
        <main className="relative flex flex-1 items-center justify-center px-4 pb-16 pt-6 sm:px-6 lg:px-12 lg:pt-12">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
