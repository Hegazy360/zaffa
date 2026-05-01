"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import type { EventType, Setting, Size } from "@/types/venue-designer";
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

const SIZES: { value: Size; labelKey: string; hintKey: string }[] = [
  { value: "intimate", labelKey: "sizeIntimate", hintKey: "sizeIntimateHint" },
  { value: "medium", labelKey: "sizeMedium", hintKey: "sizeMediumHint" },
  { value: "large", labelKey: "sizeLarge", hintKey: "sizeLargeHint" },
];

export function EventBasicsCard() {
  const t = useTranslations("designer");
  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const size = useVenueDesignerStore((s) => s.size);
  const setEventType = useVenueDesignerStore((s) => s.setEventType);
  const setSetting = useVenueDesignerStore((s) => s.setSetting);
  const setSize = useVenueDesignerStore((s) => s.setSize);

  const eventTypeItems = EVENT_TYPES.map((item) => ({
    value: item.value,
    label: t(item.labelKey),
  }));

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

        <div className="space-y-1.5">
          <Label>{t("sizeLabel")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSize(opt.value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-start text-sm transition-colors hover:bg-accent",
                  size === opt.value
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
      </CardContent>
    </Card>
  );
}
