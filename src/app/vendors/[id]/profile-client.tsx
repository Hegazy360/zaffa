"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Sparkles,
  Star,
  Store,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { decimalToNumber } from "@/lib/payments";
import { useFormatters } from "@/lib/use-formatters";

function specialtiesArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export default function PublicVendorProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const t = useTranslations("browse");
  const f = useFormatters();
  const { data: vendor, isLoading, error } = trpc.vendors.byId.useQuery({ id });

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="mx-auto flex flex-1 max-w-3xl flex-col items-center justify-center px-6 py-24 text-center">
          <h2 className="font-display text-2xl font-light tracking-tight">
            {t("noResultsTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" render={<Link href="/vendors" />} className="mt-6">
            <ArrowLeft className="me-1.5 size-3.5" />
            {t("vendorsTitle")}
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (isLoading || !vendor) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-rose-500" />
        </div>
        <Footer />
      </div>
    );
  }

  const specialties = specialtiesArray(vendor.specialties);
  const rating = decimalToNumber(vendor.avg_rating);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="relative isolate flex-1 overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grain-bg opacity-30"
        />
        <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
          <div className="mb-8">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/vendors" />}
              className="-ms-2 gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              {t("vendorsTitle")}
            </Button>
          </div>

          <header className="mb-12 grid gap-8 md:grid-cols-12">
            <div className="md:col-span-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
                <Sparkles className="size-3" />
                {t(`category${capitalize(vendor.category)}` as const)}
              </div>
              <h1 className="font-display mt-4 text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
                {vendor.business_name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span>{vendor.profile.full_name}</span>
                {vendor.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" />
                    {vendor.location}
                  </span>
                )}
                {vendor.reviews.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-amber-700">
                    <Star className="size-4 fill-current" />
                    {rating.toFixed(1)}
                  </span>
                )}
              </div>
              {vendor.bio && (
                <p className="mt-6 max-w-2xl text-pretty text-sm text-foreground/85 sm:text-base">
                  {vendor.bio}
                </p>
              )}
              {specialties.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {specialties.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-rose-50 px-2.5 py-1 text-xs text-rose-700 ring-1 ring-rose-100"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="md:col-span-4">
              <div className="overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
                <div className="relative aspect-[4/3] bg-gradient-to-br from-rose-100 to-amber-100">
                  {vendor.profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={vendor.profile.avatar_url}
                      alt={vendor.business_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <Store className="size-12 text-rose-700/60" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {vendor.services.length > 0 && (
            <section className="mb-14">
              <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
                Services
              </p>
              <h2 className="mb-5 font-display text-2xl font-light tracking-tight">
                What we offer
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {vendor.services.map((s) => (
                  <article
                    key={s.id}
                    className="rounded-2xl border border-brand-line bg-white/80 p-5 backdrop-blur-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-medium text-foreground">{s.name}</h3>
                        {s.description && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {s.description}
                          </p>
                        )}
                      </div>
                      <p className="font-display whitespace-nowrap text-end text-base text-rose-800">
                        {t("from")}{" "}
                        {f.currency(decimalToNumber(s.price_from))}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="mb-14">
            <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
              Portfolio
            </p>
            <h2 className="mb-5 font-display text-2xl font-light tracking-tight">
              Past work
            </h2>
            {vendor.portfolio_items.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-16 text-center backdrop-blur-sm">
                <div className="mb-4 grid size-12 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
                  <ImageIcon className="size-5 text-rose-600" />
                </div>
                <p className="font-display text-lg font-light tracking-tight">
                  No portfolio yet
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vendor.portfolio_items.map((item) => (
                  <article
                    key={item.id}
                    className="group overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image_url}
                        alt={item.caption ?? ""}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                    {item.caption && (
                      <div className="space-y-1 p-4">
                        <p className="text-sm font-medium leading-tight">
                          {item.caption}
                        </p>
                        {item.event_type && (
                          <p className="text-eyebrow text-muted-foreground">
                            {item.event_type}
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section id="reviews">
            <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
              Reviews
            </p>
            <h2 className="mb-5 font-display text-2xl font-light tracking-tight">
              What planners say
            </h2>
            {vendor.reviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-12 text-center">
                <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
                  <Star className="size-4 text-rose-600" />
                </div>
                <p className="font-display text-base font-light tracking-tight">
                  No reviews yet
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {vendor.reviews.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-2xl border border-brand-line bg-white/80 p-5 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      {r.author.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.author.avatar_url}
                          alt={r.author.full_name}
                          className="size-9 rounded-full object-cover ring-1 ring-rose-200"
                        />
                      ) : (
                        <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-xs font-semibold text-rose-800">
                          {r.author.full_name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {r.author.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {f.date(r.created_at, "long")}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <Star className="size-3 fill-current" />
                        {r.rating.toFixed(1)}
                      </span>
                    </div>
                    {r.comment && (
                      <p className="mt-3 italic text-sm text-foreground/90">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
