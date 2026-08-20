"use client";

import Link from "next/link";
import {
  type KeyboardEvent,
  useState,
} from "react";
import { ArrowLeft, Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function NotificationsPreferencesPage() {
  const t = useTranslations("notifications");
  const utils = trpc.useUtils();

  const { data: me } = trpc.profile.me.useQuery();
  const { data: pref } = trpc.notifications.emailPreference.useQuery(
    undefined,
    { retry: false },
  );

  const isPlanner = me?.role === "planner";

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-2xl px-6 py-12 sm:py-16">
        <Link
          href="/dashboard/notifications"
          className="mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-rose-700"
        >
          <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
          {t("pageTitle")}
        </Link>

        <header className="mb-8 space-y-3">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            {t("pageEyebrow")}
          </p>
          <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {t("settingsTitle")}
          </h1>
        </header>

        <EmailPreferenceCard
          unsubscribed={pref?.unsubscribedFromAll ?? false}
          onChange={() => {
            void utils.notifications.emailPreference.invalidate();
          }}
        />

        {isPlanner && <PlannerServiceAreaCard />}
      </div>
    </div>
  );
}

function EmailPreferenceCard({
  unsubscribed,
  onChange,
}: {
  unsubscribed: boolean;
  onChange: () => void;
}) {
  const t = useTranslations("notifications");
  const mutation = trpc.notifications.updateEmailPreference.useMutation({
    onSuccess: () => {
      toast.success(t("unsubscribeSaved"));
      onChange();
    },
    onError: (e) => toast.error(e.message),
  });

  const enabled = !unsubscribed;

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
      <div className="border-b border-brand-line px-6 py-4">
        <h2 className="font-display text-lg font-medium tracking-tight">
          {t("settingsTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("settingsBody")}</p>
      </div>
      <div className="space-y-4 p-6">
        {unsubscribed && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
            {t("unsubscribedBanner")}
          </div>
        )}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-brand-line bg-white/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("unsubscribeLabel")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={t("unsubscribeLabel")}
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({ unsubscribedFromAll: enabled })
            }
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50",
              enabled
                ? "bg-brand-gradient"
                : "bg-muted",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform",
                enabled && "translate-x-5 rtl:-translate-x-5",
                !enabled && "rtl:-translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>
    </section>
  );
}

function PlannerServiceAreaCard() {
  const t = useTranslations("notifications");
  const utils = trpc.useUtils();
  const { data } = trpc.planner.serviceArea.useQuery(undefined, {
    retry: false,
  });

  const [seeded, setSeeded] = useState(false);
  const [country, setCountry] = useState("EG");
  const [cities, setCities] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  if (data && !seeded) {
    setSeeded(true);
    setCountry(data.country);
    setCities(data.cities);
  }

  const mutation = trpc.planner.updateServiceArea.useMutation({
    onSuccess: () => {
      toast.success(t("serviceAreaSaved"));
      void utils.planner.serviceArea.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function addCity() {
    const v = draft.trim();
    if (!v) return;
    const normalized = v.toLowerCase();
    if (cities.includes(normalized)) {
      setDraft("");
      return;
    }
    if (cities.length >= 20) return;
    setCities([...cities, normalized]);
    setDraft("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCity();
    }
  }

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
      <div className="border-b border-brand-line px-6 py-4">
        <h2 className="font-display text-lg font-medium tracking-tight">
          {t("serviceAreaTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("serviceAreaBody")}
        </p>
      </div>
      <div className="space-y-5 p-6">
        {cities.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
            {t("serviceAreaEmptyBanner")}
          </div>
        )}
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="country">{t("serviceAreaCountryLabel")}</Label>
            <Input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">{t("serviceAreaCitiesLabel")}</Label>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-input bg-transparent p-2">
              {cities.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800 ring-1 ring-rose-100"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => setCities(cities.filter((x) => x !== c))}
                    className="text-rose-700/70 hover:text-rose-900"
                    aria-label={`Remove ${c}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                id="city"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                placeholder={
                  cities.length === 0
                    ? t("serviceAreaCitiesPlaceholder")
                    : ""
                }
                className="flex-1 min-w-[140px] bg-transparent text-sm outline-none"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addCity}
                className="gap-1"
              >
                <Plus className="size-3" />
                Add
              </Button>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ country, cities })}
            className="gap-1 bg-brand-gradient text-white hover:opacity-90"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {t("serviceAreaSave")}
          </Button>
        </div>
      </div>
    </section>
  );
}
