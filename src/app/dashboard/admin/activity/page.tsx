"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ActivityRow } from "@/components/admin/activity-row";

const ALL_TYPES = [
  "signup",
  "event",
  "proposal",
  "payment",
  "engagement",
  "release",
  "review",
] as const;
type ActivityType = (typeof ALL_TYPES)[number];

export default function AdminActivityPage() {
  const t = useTranslations("admin");
  const [filter, setFilter] = useState<Set<ActivityType>>(new Set(ALL_TYPES));

  const list = trpc.adminOverview.activity.useQuery({
    limit: 100,
    types: Array.from(filter),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          {t("activityTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("activitySubtitle")}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {ALL_TYPES.map((type) => {
          const active = filter.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                setFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(type)) next.delete(type);
                  else next.add(type);
                  if (next.size === 0) return new Set(ALL_TYPES);
                  return next;
                });
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-rose-300 bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-sm"
                  : "border-brand-line bg-white/70 text-muted-foreground hover:bg-white"
              }`}
            >
              {t(`activityType.${type}`)}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-brand-line bg-white/80">
        {list.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">
            {t("noActivityYet")}
          </p>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {list.data!.items.map((item, idx) => (
              <ActivityRow
                key={`${item.type}-${idx}`}
                item={
                  item as {
                    type:
                      | "signup"
                      | "event"
                      | "proposal"
                      | "payment"
                      | "engagement"
                      | "release"
                      | "review";
                    at: string | Date;
                    data: { id: string };
                  }
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
