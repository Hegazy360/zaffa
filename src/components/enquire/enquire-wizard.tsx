"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { budgetBandsFor, type BudgetBandOption } from "@/lib/concierge-pricing";
import { REPLY_WITHIN_HOURS } from "@/lib/contact-channels";
import { WhatsAppCta } from "@/components/marketing/whatsapp-cta";
import { formatMoney } from "@/lib/money-format";
import { CountryCombobox } from "@/components/ui/country-combobox";

/**
 * Intake for "The Whole Wedding".
 *
 * Three steps, in commitment order: their day, their budget, then who they
 * are. Contact details come last on purpose, asking for a phone number before
 * the visitor has invested anything is where guided funnels leak. Every field
 * here earns its place; this buyer is already tracking a hundred things.
 *
 * Nothing is required except a name and one way to reach them. A half-answered
 * enquiry from a real couple is worth far more than a complete one we never
 * received, so validation is deliberately thin.
 */

type Guests = "intimate" | "medium" | "large";
type Channel = "whatsapp" | "email" | "phone";

const TOTAL_STEPS = 3;

export function EnquireWizard({
  showPricingLink,
  initialCountry,
  designId,
}: {
  initialCountry: string | null;
  designId: string | null;
  /** Whether the fee table is live. Passed in rather than read here so the
   *  flag is evaluated once, on the server, alongside the page's own gate. */
  showPricingLink: boolean;
}) {
  const t = useTranslations("enquire");
  const locale = useLocale();

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [country, setCountry] = useState(initialCountry ?? "");
  const [city, setCity] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [dateFlexible, setDateFlexible] = useState(false);
  const [guests, setGuests] = useState<Guests | null>(null);
  const [budgetBand, setBudgetBand] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [message, setMessage] = useState("");
  const [hp, setHp] = useState("");

  const bands = useMemo(() => budgetBandsFor(country || null), [country]);

  const submit = trpc.enquiries.submit.useMutation({
    onSuccess: () => setDone(true),
    onError: () => setError(t("errorGeneric")),
  });

  function bandLabel(b: BudgetBandOption): string {
    if (b.to === null) {
      return t("budgetAbove", { amount: formatMoney(b.from, b.currency, locale) });
    }
    if (b.from === 0) {
      return t("budgetBelow", { amount: formatMoney(b.to, b.currency, locale) });
    }
    return t("budgetRange", {
      from: formatMoney(b.from, b.currency, locale),
      to: formatMoney(b.to, b.currency, locale),
    });
  }

  const canSubmit = fullName.trim().length > 0 && (email.trim() || phone.trim());

  function handleSubmit() {
    setError(null);
    if (!fullName.trim()) return setError(t("errorRequired"));
    if (!email.trim() && !phone.trim()) return setError(t("errorContact"));
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return setError(t("errorEmail"));
    }
    submit.mutate({
      fullName: fullName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      preferredChannel: channel,
      country: country || undefined,
      city: city.trim() || undefined,
      eventDate: eventDate ? new Date(eventDate) : undefined,
      dateFlexible,
      guestBand: guests ?? undefined,
      budgetBand: budgetBand ?? undefined,
      budgetCurrency: bands[0]?.currency,
      message: message.trim() || undefined,
      designId: designId ?? undefined,
      source: designId ? "render_page" : "whole_wedding_home",
      locale,
      hp: hp || undefined,
    });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-6 grid size-14 place-items-center rounded-full bg-gradient-to-br from-rose-600 to-amber-500 text-white">
          <Check className="size-6" strokeWidth={2.5} />
        </div>
        <h1 className="font-display text-balance text-3xl font-light tracking-tight sm:text-4xl">
          {t("doneTitle")}
        </h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
          {t("doneBody", { hours: REPLY_WITHIN_HOURS })}
        </p>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          {t("donePromise")}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <WhatsAppCta
            surface="enquire_confirmation"
            label={t("doneWhatsapp")}
            className="w-full sm:w-auto"
          />
          <Button
            size="lg"
            variant="outline"
            render={<Link href="/" />}
            className="h-12 w-full px-6 sm:w-auto"
          >
            {t("doneHome")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      {/* Progress. `aria-current` marks the live step so the state is not
          conveyed by colour alone. */}
      <ol className="mb-8 flex items-center gap-2" aria-label={t("title")}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <li
            key={i}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= step
                ? "bg-brand-gradient"
                : "bg-rose-100",
            )}
          />
        ))}
      </ol>
      <p className="mb-2 text-xs text-eyebrow text-muted-foreground">
        {t("stepOf", { n: step + 1, total: TOTAL_STEPS })}
      </p>

      {step === 0 && (
        <section>
          <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
            {t("step1Title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("step1Hint")}</p>

          <div className="mt-6 space-y-5">
            <div>
              <Label htmlFor="eq-country">{t("countryLabel")}</Label>
              <CountryCombobox
                id="eq-country"
                value={country}
                onValueChange={setCountry}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="eq-city">{t("cityLabel")}</Label>
              <Input
                id="eq-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("cityPlaceholder")}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="eq-date">{t("dateLabel")}</Label>
              <Input
                id="eq-date"
                type="date"
                value={eventDate}
                disabled={dateFlexible}
                onChange={(e) => setEventDate(e.target.value)}
                className="mt-1.5"
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={dateFlexible}
                  onChange={(e) => {
                    setDateFlexible(e.target.checked);
                    if (e.target.checked) setEventDate("");
                  }}
                  className="size-4 rounded border-rose-200 accent-rose-600"
                />
                {t("dateFlexibleLabel")}
              </label>
            </div>
            <div>
              <span className="text-sm font-medium">{t("guestsLabel")}</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["intimate", "medium", "large"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={guests === g}
                    onClick={() => setGuests(g)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      guests === g
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : "border-brand-line hover:border-rose-200",
                    )}
                  >
                    {t(
                      g === "intimate"
                        ? "guestsIntimate"
                        : g === "medium"
                          ? "guestsMedium"
                          : "guestsLarge",
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
            {t("step2Title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("step2Hint")}</p>

          {designId && (
            <p className="mt-4 rounded-2xl border border-brand-line bg-rose-50/60 px-4 py-3 text-sm text-rose-800">
              {t("designAttached")}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {bands.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={budgetBand === b.id}
                onClick={() => setBudgetBand(b.id)}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-start text-sm transition-colors",
                  budgetBand === b.id
                    ? "border-rose-300 bg-rose-50 text-rose-800"
                    : "border-brand-line hover:border-rose-200",
                )}
              >
                <bdi>{bandLabel(b)}</bdi>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={budgetBand === "unspecified"}
              onClick={() => setBudgetBand("unspecified")}
              className={cn(
                "rounded-2xl border px-4 py-3 text-start text-sm text-muted-foreground transition-colors",
                budgetBand === "unspecified"
                  ? "border-rose-300 bg-rose-50"
                  : "border-brand-line hover:border-rose-200",
              )}
            >
              {t("budgetSkip")}
            </button>
          </div>

          {/* The obvious question at the moment a budget is asked for is
              "so what do you charge?". Link, don't repeat - /pricing is the
              single source of truth and this step must not drift from it. */}
          {showPricingLink && (
            <p className="mt-4 text-xs text-muted-foreground">
              <Link
                href="/pricing"
                target="_blank"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("budgetPricingLink")}
              </Link>
            </p>
          )}
        </section>
      )}

      {step === 2 && (
        <section>
          <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
            {t("step3Title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("step3Hint")}</p>

          <div className="mt-6 space-y-5">
            <div>
              <Label htmlFor="eq-name">{t("nameLabel")}</Label>
              <Input
                id="eq-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="mt-1.5"
                required
              />
            </div>
            <div>
              <Label htmlFor="eq-phone">{t("phoneLabel")}</Label>
              <Input
                id="eq-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("phonePlaceholder")}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="eq-email">{t("emailLabel")}</Label>
              <Input
                id="eq-email"
                type="email"
                inputMode="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("emailHint")}</p>
            </div>
            <div>
              <span className="text-sm font-medium">{t("channelLabel")}</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["whatsapp", "email", "phone"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={channel === c}
                    onClick={() => setChannel(c)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      channel === c
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : "border-brand-line hover:border-rose-200",
                    )}
                  >
                    {t(
                      c === "whatsapp"
                        ? "channelWhatsapp"
                        : c === "email"
                          ? "channelEmail"
                          : "channelPhone",
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="eq-message">{t("messageLabel")}</Label>
              <Textarea
                id="eq-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("messagePlaceholder")}
                rows={4}
                className="mt-1.5"
              />
            </div>
            {/* Honeypot - visually hidden, never announced. */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              className="pointer-events-none absolute size-0 opacity-0"
            />
          </div>
        </section>
      )}

      {error && (
        <p role="alert" aria-live="polite" className="mt-5 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center gap-3">
        {step > 0 && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setStep((s) => s - 1)}
            className="h-12 gap-2"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {t("back")}
          </Button>
        )}
        {step < TOTAL_STEPS - 1 ? (
          <Button
            type="button"
            size="lg"
            onClick={() => setStep((s) => s + 1)}
            className="group h-12 flex-1 gap-2 bg-brand-gradient text-white sm:flex-none sm:px-8"
          >
            {t("next")}
            <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={!canSubmit || submit.isPending}
            onClick={handleSubmit}
            className="group h-12 flex-1 gap-2 bg-brand-gradient text-white sm:flex-none sm:px-8"
          >
            {submit.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("submitting")}
              </>
            ) : (
              <>
                {t("submit")}
                <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
