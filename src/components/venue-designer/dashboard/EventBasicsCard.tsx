"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import {
  GUEST_COUNT_MAX,
  GUEST_COUNT_MIN,
  GUEST_COUNT_PRESETS,
  sizeFromGuestCount,
  type EventType,
  type Setting,
} from "@/types/venue-designer";
import { cn } from "@/lib/utils";

const EVENT_TYPES: { value: EventType; labelKey: string }[] = [
  { value: "wedding", labelKey: "eventTypeWedding" },
  { value: "engagement", labelKey: "eventTypeEngagement" },
  { value: "birthday", labelKey: "eventTypeBirthday" },
  { value: "corporate", labelKey: "eventTypeCorporate" },
  { value: "other", labelKey: "eventTypeOther" },
];

const SETTINGS: { value: Setting; labelKey: string; hintKey: string }[] = [
  { value: "indoor", labelKey: "settingIndoor", hintKey: "settingIndoorHint" },
  { value: "outdoor", labelKey: "settingOutdoor", hintKey: "settingOutdoorHint" },
  { value: "tent", labelKey: "settingTent", hintKey: "settingTentHint" },
];

export function EventBasicsCard() {
  const t = useTranslations("designer");
  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const guestCount = useVenueDesignerStore((s) => s.guestCount);
  const setEventType = useVenueDesignerStore((s) => s.setEventType);
  const setSetting = useVenueDesignerStore((s) => s.setSetting);
  const setGuestCount = useVenueDesignerStore((s) => s.setGuestCount);

  const eventTypeItems = EVENT_TYPES.map((item) => ({
    value: item.value,
    label: t(item.labelKey),
  }));

  // Mirrors the hint text under the size buckets we used to render — gives
  // the couple a sense of what their number means for layout (and what the
  // AI will translate it into) without overwhelming them.
  const sizeBucket = guestCount != null ? sizeFromGuestCount(guestCount) : null;
  const sizeBucketHint =
    sizeBucket === "intimate"
      ? t("guestCountBucketIntimate")
      : sizeBucket === "medium"
      ? t("guestCountBucketMedium")
      : sizeBucket === "large"
      ? t("guestCountBucketLarge")
      : null;

  function handleGuestCountChange(raw: string) {
    if (raw.trim() === "") {
      setGuestCount(null);
      return;
    }
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n <= 0) {
      setGuestCount(null);
      return;
    }
    setGuestCount(Math.min(Math.max(n, GUEST_COUNT_MIN), GUEST_COUNT_MAX));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stepBasicsTitle")}</CardTitle>
        <CardDescription>{t("basicsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="event-type">{t("eventTypeLabel")}</Label>
          <Select
            items={eventTypeItems}
            value={eventType}
            onValueChange={(v) => v && setEventType(v as EventType)}
          >
            <SelectTrigger id="event-type" className="w-full">
              <SelectValue placeholder={t("chooseEventType")} />
            </SelectTrigger>
            <SelectContent>
              {eventTypeItems.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("settingLabel")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {SETTINGS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSetting(opt.value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-start text-sm transition-colors hover:bg-accent",
                  setting === opt.value
                    ? "border-rose-400 bg-rose-50/60 ring-1 ring-rose-300"
                    : "border-input"
                )}
              >
                <div className="font-medium">{t(opt.labelKey)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t(opt.hintKey)}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="guest-count">{t("guestCountLabel")}</Label>
            {sizeBucketHint && guestCount && guestCount > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {sizeBucketHint}
              </span>
            )}
          </div>
          <div className="relative">
            <Users className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="guest-count"
              type="number"
              inputMode="numeric"
              min={GUEST_COUNT_MIN}
              max={GUEST_COUNT_MAX}
              step={5}
              value={guestCount ?? ""}
              onChange={(e) => handleGuestCountChange(e.target.value)}
              placeholder={t("guestCountPlaceholder")}
              className="h-10 ps-8 pe-16 text-base"
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {t("guestCountUnit")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("guestCountHelp")}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {GUEST_COUNT_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setGuestCount(n)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent",
                  guestCount === n
                    ? "border-rose-400 bg-rose-50/60 text-rose-700 ring-1 ring-rose-300"
                    : "border-input text-muted-foreground"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
