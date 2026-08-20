"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  Loader2,
  Star,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";
import {
  prospectDisplayName,
  prospectInitial,
} from "@/lib/prospect-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const COLUMNS = [
  "new",
  "qualified",
  "drafted",
  "contacted",
  "replied",
  "signed_up",
] as const;
type Status = (typeof COLUMNS)[number];

export default function OutreachKanbanPage() {
  const t = useTranslations("admin");
  const f = useFormatters();
  const all = trpc.prospects.list.useQuery({ limit: 200 });
  const items = all.data?.items ?? [];

  const grouped: Record<Status, typeof items> = {
    new: [],
    qualified: [],
    drafted: [],
    contacted: [],
    replied: [],
    signed_up: [],
  };
  for (const p of items) {
    if (p.status in grouped) grouped[p.status as Status].push(p);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight">
            {t("outreachKanbanTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("outreachKanbanSubtitle")}
          </p>
        </div>
        <Link
          href="/dashboard/admin/outreach/templates"
          className="text-xs font-medium text-rose-700 hover:underline"
        >
          {t("manageTemplates")} <ChevronRight className="inline size-3" />
        </Link>
      </header>

      {all.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-rose-500" />
        </div>
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0 lg:pb-0">
          {COLUMNS.map((status) => (
            <div
              key={status}
              className="w-[80vw] max-w-[320px] shrink-0 snap-start rounded-2xl border border-brand-line bg-white/80 lg:w-auto lg:max-w-none lg:shrink"
            >
              <div className="flex items-center justify-between border-b border-brand-line px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                  {t(`prospectStatus.${status}`)}
                </p>
                <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                  {grouped[status].length}
                </span>
              </div>
              <ul className="space-y-1 p-2">
                {grouped[status].length === 0 && (
                  <li className="px-1 py-2 text-center text-[11px] text-muted-foreground">
                    —
                  </li>
                )}
                {grouped[status].slice(0, 25).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/dashboard/admin/prospects/${p.id}`}
                      className="block rounded-lg px-2 py-2 text-xs transition-colors hover:bg-rose-50/60"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                          <AvatarFallback className="text-[10px]">
                            {prospectInitial(p)}
                          </AvatarFallback>
                        </Avatar>
                        <p className="truncate font-medium">
                          {prospectDisplayName(p)}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">
                        {t(`prospectType.${p.prospect_type}`)}
                        {p.vendor_category && ` · ${p.vendor_category}`}
                        {p.qualifying_score != null && (
                          <>
                            {" · "}
                            <Star className="inline size-2 fill-amber-500 text-amber-500" />{" "}
                            {p.qualifying_score}
                          </>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground/80">
                        {f.relativeTime(p.created_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
