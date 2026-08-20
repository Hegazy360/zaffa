import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";

/**
 * 404, in the reader's language.
 *
 * Was entirely hardcoded English — "Page Not Found", "Go Home" — served to
 * Arabic, French and German visitors alike, on the one page where somebody is
 * already confused. It is a server component, so `getTranslations` resolves
 * the same locale the rest of the site is using.
 *
 * It also keeps the navbar and footer. A dead-end 404 with a single "Go Home"
 * button throws away a visitor who was trying to reach us; with the chrome
 * they can carry on, and the second CTA offers the thing they were probably
 * looking for.
 */
export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-rose-50/50 via-background to-background px-4 py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grain-bg opacity-40"
        />
        <div className="relative mx-auto max-w-lg text-center">
          <p className="font-display bg-gradient-to-br from-rose-600 to-amber-500 bg-clip-text text-7xl font-light text-transparent">
            404
          </p>
          <h1 className="mt-4 font-display text-balance text-3xl font-light tracking-tight sm:text-4xl">
            {t("notFoundTitle")}
          </h1>
          <p className="mt-3 text-pretty text-sm text-muted-foreground sm:text-base">
            {t("notFoundBody")}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              render={<Link href="/" />}
              className="group h-12 w-full gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-6 text-white sm:w-auto"
            >
              {t("notFoundHome")}
              <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/enquire" />}
              className="h-12 w-full border-rose-200/80 px-6 text-rose-700 hover:bg-rose-50/70 hover:text-rose-700 sm:w-auto"
            >
              {t("notFoundEnquire")}
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
