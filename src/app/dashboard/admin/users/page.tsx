"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search, ShieldCheck, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type RoleFilter = "all" | "client" | "planner" | "vendor" | "admin";

const ROLE_FILTERS: RoleFilter[] = ["all", "client", "planner", "vendor", "admin"];

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const f = useFormatters();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");

  const list = trpc.adminOverview.usersList.useQuery({
    q: q.trim() || undefined,
    role: role === "all" ? undefined : role,
    limit: 100,
  });

  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          {t("usersTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("usersSubtitle")}
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("usersSearchPlaceholder")}
            className="ps-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                role === r
                  ? "border-rose-300 bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-sm"
                  : "border-brand-line bg-white/70 text-muted-foreground hover:bg-white"
              }`}
            >
              {t(`roleFilter.${r}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-brand-line bg-white/80">
        {list.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">
            {t("usersNoResults")}
          </p>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {items.map((u) => {
              const businessName =
                u.planner_profile?.business_name ??
                u.vendor_profile?.business_name ??
                null;
              const location =
                u.planner_profile?.location ??
                u.vendor_profile?.location ??
                null;
              const rating =
                u.planner_profile?.review_count
                  ? Number(u.planner_profile.avg_rating)
                  : u.vendor_profile?.review_count
                    ? Number(u.vendor_profile.avg_rating)
                    : null;
              const reviews =
                u.planner_profile?.review_count ??
                u.vendor_profile?.review_count ??
                0;
              const verified =
                u.planner_profile?.verified ??
                u.vendor_profile?.verified ??
                false;
              return (
                <li key={u.id}>
                  <Link
                    href={`/dashboard/admin/users/${u.id}`}
                    className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-rose-50/40"
                  >
                    <Avatar className="size-10">
                      {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                      <AvatarFallback>
                        {u.full_name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-medium">{u.full_name}</p>
                        {verified && (
                          <ShieldCheck
                            className="size-3.5 text-emerald-600"
                            aria-label={t("verified")}
                          />
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {businessName && (
                          <span className="font-medium">{businessName} · </span>
                        )}
                        <span className="capitalize">
                          {t(`role.${u.role}`)}
                        </span>
                        {u.vendor_profile?.category &&
                          ` · ${u.vendor_profile.category}`}
                        {location && ` · ${location}`}
                        {` · ${u.locale.toUpperCase()}`}
                      </p>
                    </div>
                    {rating != null && (
                      <span className="hidden items-center gap-0.5 text-xs sm:inline-flex">
                        <Star className="size-3 fill-amber-500 text-amber-500" />
                        <span className="font-mono tabular-nums">
                          {rating.toFixed(1)}
                        </span>
                        <span className="text-muted-foreground">
                          ({reviews})
                        </span>
                      </span>
                    )}
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {f.relativeTime(u.created_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
