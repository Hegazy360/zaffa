"use client";

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

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "wedding", label: "Wedding" },
  { value: "engagement", label: "Engagement" },
  { value: "birthday", label: "Birthday" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Other" },
];

const SETTINGS: { value: Setting; label: string; hint: string }[] = [
  { value: "indoor", label: "Indoor", hint: "Ballrooms, halls, restaurants" },
  { value: "outdoor", label: "Outdoor", hint: "Gardens, beaches, terraces" },
  { value: "tent", label: "Tent", hint: "Marquee or covered outdoor" },
];

const SIZES: { value: Size; label: string; hint: string }[] = [
  { value: "intimate", label: "Intimate", hint: "Up to ~50 guests" },
  { value: "medium", label: "Medium", hint: "50-150 guests" },
  { value: "large", label: "Large", hint: "150+ guests" },
];

export function EventBasicsCard() {
  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const size = useVenueDesignerStore((s) => s.size);
  const setEventType = useVenueDesignerStore((s) => s.setEventType);
  const setSetting = useVenueDesignerStore((s) => s.setSetting);
  const setSize = useVenueDesignerStore((s) => s.setSize);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event basics</CardTitle>
        <CardDescription>
          A few essentials so the AI knows what kind of event it is rendering.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="event-type">Event type</Label>
          <Select
            value={eventType}
            onValueChange={(v) => v && setEventType(v as EventType)}
          >
            <SelectTrigger id="event-type" className="w-full">
              <SelectValue placeholder="Choose event type" />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Setting</Label>
          <div className="grid grid-cols-3 gap-2">
            {SETTINGS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSetting(opt.value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                  setting === opt.value
                    ? "border-rose-400 bg-rose-50/60 ring-1 ring-rose-300"
                    : "border-input"
                )}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {opt.hint}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Size</Label>
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSize(opt.value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                  size === opt.value
                    ? "border-rose-400 bg-rose-50/60 ring-1 ring-rose-300"
                    : "border-input"
                )}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {opt.hint}
                </div>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
