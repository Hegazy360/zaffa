"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Send, XIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { REPLY_WITHIN_HOURS } from "@/lib/contact-channels";
import { COUNTRY_CODES } from "@/lib/countries";
import { latinDigits, parseWeddingDate, phoneForCountry } from "@/lib/lead-details";
import { VISION_PACK_COUNTRY_COOKIE } from "@/lib/vision-pack-pricing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { WhatsAppCta } from "@/components/marketing/whatsapp-cta";

/**
 * The version an approval pins: the one on screen when it is a render of
 * this design, else the newest. `renderIds` is newest first.
 */
export function pickApproveMediaId(
  activeId: string | null | undefined,
  renderIds: readonly string[],
): string | undefined {
  if (activeId && renderIds.includes(activeId)) return activeId;
  return renderIds[0];
}

/** The visitor's country from the pricing cookie, as the enquiry wizard does. */
function countryFromCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${VISION_PACK_COUNTRY_COOKIE}=([A-Za-z]{2})(?:;|$)`),
  );
  const code = match?.[1]?.toUpperCase() ?? "";
  return COUNTRY_CODES.includes(code) ? code : "";
}

/** `YYYY-MM` for this month, the earliest a wedding month can be. */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

interface ApproveResult {
  enquiryId: string | null;
  alreadyApproved: boolean;
  detailsAdded: boolean;
}

interface ApproveDesignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  designId: string;
  designName: string;
  /** The render version the couple is looking at, pinned for the quote. */
  mediaId?: string;
}

/**
 * F5: every "approve this design" entry point opens this (the share panel,
 * the designer header, the gallery, the dashboard and the decor plan CTA).
 *
 * Approval used to be one click and a toast: the first real couple's lead
 * arrived with no phone (Google sign-in), no date and no place, and sat
 * for 16 days. Here the couple can leave, all optional, a WhatsApp number,
 * the wedding month and where it is, and then sees what happens next and
 * can open a WhatsApp chat with the team that names the design.
 *
 * Approval and money surface, so the Arabic is فصحى.
 */
export function ApproveDesignDialog({
  open,
  onOpenChange,
  designId,
  designName,
  mediaId,
}: ApproveDesignDialogProps) {
  const t = useTranslations("approveFlow");
  const utils = trpc.useUtils();
  const ids = {
    phone: useId(),
    phoneHint: useId(),
    month: useId(),
    monthHint: useId(),
    city: useId(),
    country: useId(),
  };

  // A number already on the profile is offered, not forced: `null` means
  // the couple has not touched the field yet.
  const { data: profile } = trpc.profile.me.useQuery(undefined, {
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const [phoneInput, setPhoneInput] = useState<string | null>(null);
  const phone = phoneInput ?? profile?.phone ?? "";
  const [month, setMonth] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState(countryFromCookie);
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [monthInvalid, setMonthInvalid] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<ApproveResult | null>(null);

  const approve = trpc.venueDesigns.approve.useMutation({
    onSuccess: (res) => {
      setResult(res);
      void utils.venueDesigns.list.invalidate();
      void utils.venueDesigns.getById.invalidate({ id: designId });
      // The dashboard's "we're on it" card reads enquiries.mine.
      void utils.enquiries.mine.invalidate();
    },
    onError: () => setFailed(true),
  });

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // A reopened dialog starts at the form, with what was typed kept.
      setResult(null);
      setFailed(false);
    }
  };

  // A local number (`0100 123 4567`) is read against the country field and
  // sent in international form, the only form a WhatsApp chat opens from.
  const phoneValue = phone.trim();
  const phoneResolved = phoneValue ? phoneForCountry(phoneValue, country) : null;
  // Said back under the field whenever it is not what was typed (a code
  // added, a 0 dropped), since the country is the wedding's, not always
  // the phone's.
  const phoneRewritten =
    phoneResolved !== null &&
    phoneResolved.slice(1) !== latinDigits(phoneValue).replace(/\D/g, "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const badPhone = phoneValue !== "" && phoneResolved === null;
    const badMonth = month !== "" && parseWeddingDate(month) === null;
    setPhoneInvalid(badPhone);
    setMonthInvalid(badMonth);
    if (badPhone) return document.getElementById(ids.phone)?.focus();
    if (badMonth) return document.getElementById(ids.month)?.focus();
    approve.mutate({
      designId,
      ...(mediaId ? { mediaId } : {}),
      phone: phoneResolved ?? undefined,
      eventDate: month || undefined,
      city: city.trim() || undefined,
      country: country || undefined,
    });
  };

  const reference = (result?.enquiryId ?? designId).slice(0, 8).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-md sm:p-6"
      >
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              className="absolute end-2 top-2 size-11"
              aria-label={t("close")}
            />
          }
        >
          <XIcon aria-hidden />
        </DialogClose>

        {result ? (
          <div className="space-y-5" data-testid="approve-success">
            <div className="space-y-2 pe-8">
              <span className="grid size-11 place-items-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                <CheckCircle2 aria-hidden className="size-5" />
              </span>
              <DialogTitle className="font-display text-2xl leading-tight font-light">
                {t("successTitle")}
              </DialogTitle>
              {result.alreadyApproved ? (
                <DialogDescription>
                  {result.detailsAdded ? t("detailsAdded") : t("alreadyWithTeam")}
                </DialogDescription>
              ) : null}
            </div>

            <section className="space-y-3 rounded-xl bg-rose-50/60 p-4">
              <h3 className="text-sm font-medium">{t("nextTitle")}</h3>
              <ol className="space-y-2.5 text-sm text-muted-foreground">
                {[
                  t("nextStep1"),
                  t("nextStep2", { hours: REPLY_WITHIN_HOURS }),
                  t("nextStep3"),
                ].map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-xs font-medium text-rose-700 ring-1 ring-rose-200"
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="flex flex-col gap-2">
              <WhatsAppCta
                surface="design_approved"
                message={t("whatsappMessage", { design: designName, ref: reference })}
                label={t("whatsappCta")}
                className="w-full"
              />
              <DialogClose render={<Button variant="ghost" className="h-11 w-full" />}>
                {t("done")}
              </DialogClose>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-5">
            <div className="space-y-1.5 pe-8">
              <DialogTitle className="font-display text-2xl leading-tight font-light">
                {t("title")}
              </DialogTitle>
              <DialogDescription>{t("intro")}</DialogDescription>
              <p className="text-xs text-muted-foreground">{t("optionalNote")}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={ids.phone}>{t("phoneLabel")}</Label>
              <Input
                id={ids.phone}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                // Numbers read left to right in every locale.
                dir="ltr"
                maxLength={20}
                value={phone}
                onChange={(e) => {
                  // Arabic-Indic digits separated by spaces are laid out
                  // right to left by the bidi algorithm even in an LTR
                  // field, so "٠١٠١ ٢٣٤ ٥٦٧٨" showed its groups in reverse
                  // while being typed. Latin digits, the rule on every
                  // money and contact surface, read the way they are dialled.
                  setPhoneInput(latinDigits(e.target.value));
                  setPhoneInvalid(false);
                }}
                placeholder={t("phonePlaceholder")}
                aria-invalid={phoneInvalid || undefined}
                aria-describedby={ids.phoneHint}
                className="h-11 text-start"
              />
              <p
                id={ids.phoneHint}
                className={phoneInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
              >
                {phoneInvalid
                  ? t("phoneInvalid")
                  : phoneRewritten
                    ? t.rich("phoneWillUse", {
                        phone: phoneResolved,
                        num: (chunks) => (
                          <bdi dir="ltr" className="font-medium text-foreground">
                            {chunks}
                          </bdi>
                        ),
                      })
                    : t("phoneHint")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={ids.month}>{t("dateLabel")}</Label>
              <Input
                id={ids.month}
                type="month"
                min={thisMonth()}
                // Browsers without a month picker show a text box: say the shape.
                placeholder="YYYY-MM"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setMonthInvalid(false);
                }}
                aria-invalid={monthInvalid || undefined}
                aria-describedby={ids.monthHint}
                className="h-11"
              />
              <p
                id={ids.monthHint}
                className={monthInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
              >
                {monthInvalid ? t("dateInvalid") : t("dateHint")}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={ids.city}>{t("cityLabel")}</Label>
                <Input
                  id={ids.city}
                  autoComplete="address-level2"
                  maxLength={80}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t("cityPlaceholder")}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.country}>{t("countryLabel")}</Label>
                <CountryCombobox
                  id={ids.country}
                  value={country}
                  onValueChange={setCountry}
                  placeholder={t("countryPlaceholder")}
                  inputClassName="h-11"
                />
              </div>
            </div>

            {failed ? (
              <p role="alert" className="text-sm text-destructive">
                {t("error")}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose render={<Button type="button" variant="ghost" className="h-11" />}>
                {t("cancel")}
              </DialogClose>
              <Button type="submit" variant="cta" size="xl" disabled={approve.isPending}>
                {approve.isPending ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  <Send aria-hidden className="size-4 rtl:-scale-x-100" />
                )}
                {approve.isPending ? t("submitting") : t("submit")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
