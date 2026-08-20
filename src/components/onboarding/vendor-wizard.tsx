"use client";

import { type KeyboardEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TOTAL_STEPS = 3;
const BIO_LIMIT = 600;
const MAX_SPECIALTIES = 8;

const CATEGORIES = [
  "catering",
  "photography",
  "videography",
  "flowers",
  "music",
  "decoration",
  "venue",
  "makeup",
  "fashion",
  "transportation",
  "other",
] as const;

type Category = (typeof CATEGORIES)[number];

export function VendorOnboardingWizard() {
  const t = useTranslations("vendor");
  const utils = trpc.useUtils();
  const [step, setStep] = useState(1);

  useEffect(() => {
    track(ANALYTICS_EVENTS.ONBOARDING_STARTED, { role: "vendor" });
  }, []);
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [specialtyDraft, setSpecialtyDraft] = useState("");

  const update = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success(t("wizardCreatedToast"));
      utils.vendors.me.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function addSpecialty() {
    const value = specialtyDraft.trim();
    if (!value) return;
    if (specialties.includes(value)) {
      setSpecialtyDraft("");
      return;
    }
    if (specialties.length >= MAX_SPECIALTIES) return;
    setSpecialties((prev) => [...prev, value]);
    setSpecialtyDraft("");
  }

  function onSpecialtyKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSpecialty();
    }
  }

  function handleNext() {
    if (step === 1) {
      if (!businessName.trim()) {
        toast.error(t("wizardErrorBusinessName"));
        return;
      }
      if (!category) {
        toast.error(t("wizardErrorCategory"));
        return;
      }
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function handleSubmit() {
    if (!businessName.trim()) {
      toast.error(t("wizardErrorBusinessName"));
      setStep(1);
      return;
    }
    if (!category) {
      toast.error(t("wizardErrorCategory"));
      setStep(1);
      return;
    }
    update.mutate({
      business_name: businessName.trim(),
      category,
      bio: bio.trim() || null,
      location: location.trim() || null,
      specialties,
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="overflow-hidden rounded-2xl border border-brand-line bg-white/80 shadow-sm backdrop-blur-sm">
        <header className="border-b border-brand-line bg-gradient-to-r from-rose-50/80 to-amber-50/60 px-6 py-5">
          <div className="flex items-center gap-2 text-rose-700/80">
            <Sparkles className="size-4" />
            <span className="text-eyebrow font-medium">
              {t("wizardStepLabel", { current: step, total: TOTAL_STEPS })}
            </span>
          </div>
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i + 1 <= step
                    ? "bg-brand-gradient"
                    : "bg-rose-100"
                }`}
              />
            ))}
          </div>
        </header>

        <div className="space-y-6 p-6">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-light tracking-tight">
                  {t("wizardBasicsTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("wizardBasicsSubtitle")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-business">{t("wizardBusinessName")}</Label>
                <Input
                  id="wiz-business"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t("wizardBusinessNamePlaceholder")}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("wizardCategoryLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("wizardCategoryHint")}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CATEGORIES.map((c) => {
                    const active = category === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        className={`rounded-xl border px-3 py-2 text-center text-sm transition ${
                          active
                            ? "border-rose-300 bg-gradient-to-br from-rose-50 to-amber-50 text-rose-900 ring-2 ring-rose-200"
                            : "border-brand-line bg-white/60 text-foreground/80 hover:border-rose-200 hover:bg-rose-50/40"
                        }`}
                      >
                        {t(`wizardCategory_${c}` as const)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-bio">{t("wizardBio")}</Label>
                <Textarea
                  id="wiz-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_LIMIT))}
                  rows={4}
                  placeholder={t("wizardBioPlaceholder")}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {t("wizardBioHint", { count: BIO_LIMIT - bio.length })}
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-light tracking-tight">
                  {t("wizardLocationStepTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("wizardLocationStepSubtitle")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-location">{t("wizardLocation")}</Label>
                <Input
                  id="wiz-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("wizardLocationPlaceholder")}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-specialty">
                  {t("wizardSpecialties")}
                </Label>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-input bg-transparent p-2">
                  {specialties.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800 ring-1 ring-rose-100"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() =>
                          setSpecialties((prev) =>
                            prev.filter((x) => x !== s),
                          )
                        }
                        className="text-rose-700/70 hover:text-rose-900"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="wiz-specialty"
                    value={specialtyDraft}
                    onChange={(e) => setSpecialtyDraft(e.target.value)}
                    onKeyDown={onSpecialtyKey}
                    disabled={specialties.length >= MAX_SPECIALTIES}
                    placeholder={
                      specialties.length === 0
                        ? t("wizardSpecialtyPlaceholder")
                        : ""
                    }
                    className="min-w-[120px] flex-1 rounded-sm bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addSpecialty}
                    disabled={
                      !specialtyDraft.trim() ||
                      specialties.length >= MAX_SPECIALTIES
                    }
                    className="gap-1"
                  >
                    <Plus className="size-3" />
                    {t("wizardAddSpecialty")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("wizardSpecialtiesHint")}
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-light tracking-tight">
                  {t("wizardSummaryTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("wizardSummarySubtitle")}
                </p>
              </div>
              <dl className="divide-y divide-rose-100/70 rounded-xl border border-brand-line bg-rose-50/40">
                <SummaryRow
                  label={t("wizardBusinessName")}
                  value={businessName.trim() || "-"}
                />
                <SummaryRow
                  label={t("wizardCategoryLabel")}
                  value={
                    category
                      ? t(`wizardCategory_${category}` as const)
                      : "-"
                  }
                />
                <SummaryRow
                  label={t("wizardBio")}
                  value={bio.trim() || "-"}
                  multiline
                />
                <SummaryRow
                  label={t("wizardLocation")}
                  value={location.trim() || "-"}
                />
                <SummaryRow
                  label={t("wizardSpecialties")}
                  value={
                    specialties.length > 0
                      ? specialties.join(", ")
                      : t("wizardSummaryNoSpecialties")
                  }
                />
              </dl>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-brand-line pt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1 || update.isPending}
              className="gap-1"
            >
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("wizardBack")}
            </Button>
            {step < TOTAL_STEPS ? (
              <Button
                type="button"
                onClick={handleNext}
                className="gap-1 bg-brand-gradient text-white"
              >
                {t("wizardNext")}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={update.isPending}
                className="gap-1 bg-brand-gradient text-white"
              >
                {update.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {t("wizardSubmit")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-eyebrow font-medium text-rose-700/70">
        {label}
      </dt>
      <dd
        className={`text-sm text-foreground/90 ${multiline ? "whitespace-pre-line text-end" : "text-end"}`}
      >
        {value}
      </dd>
    </div>
  );
}
