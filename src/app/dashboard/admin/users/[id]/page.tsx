"use client";

import Link from "next/link";
import { use } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Star,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("admin");
  const f = useFormatters();
  const utils = trpc.useUtils();
  const detail = trpc.adminOverview.userById.useQuery({ id });
  const setVerified = trpc.admin.setVerified.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(
        variables.verified
          ? t("verifiedToast")
          : t("unverifiedToast"),
      );
      utils.adminOverview.userById.invalidate({ id });
      utils.adminOverview.usersList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-rose-500" />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-muted-foreground">{t("userNotFound")}</p>
      </div>
    );
  }

  const { profile, events, plannerProposals, plannerEvents, vendorEngagements } =
    detail.data;

  const businessName =
    profile.planner_profile?.business_name ??
    profile.vendor_profile?.business_name ??
    null;
  const location =
    profile.planner_profile?.location ??
    profile.vendor_profile?.location ??
    null;
  const verified =
    profile.planner_profile?.verified ??
    profile.vendor_profile?.verified ??
    false;
  const rating =
    profile.planner_profile?.review_count
      ? Number(profile.planner_profile.avg_rating)
      : profile.vendor_profile?.review_count
        ? Number(profile.vendor_profile.avg_rating)
        : null;
  const reviews =
    profile.planner_profile?.review_count ??
    profile.vendor_profile?.review_count ??
    0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/admin/users"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 hover:underline"
      >
        <ArrowLeft className="size-3 rtl:-scale-x-100" />
        {t("backToUsers")}
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="size-16">
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} />}
          <AvatarFallback className="text-lg">
            {profile.full_name.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-light tracking-tight">
              {profile.full_name}
            </h1>
            {verified && (
              <ShieldCheck className="size-4 text-emerald-600" />
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {businessName && (
              <span className="font-medium">{businessName} · </span>
            )}
            {t(`role.${profile.role}`)}
            {profile.vendor_profile?.category && (
              <span> · {profile.vendor_profile.category}</span>
            )}
            {location && <span> · {location}</span>}
            <span> · {profile.locale.toUpperCase()}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("joinedOn", { date: f.date(profile.created_at, "medium") })}
          </p>
        </div>
        {rating != null && (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm ring-1 ring-amber-200">
            <Star className="size-4 fill-amber-500 text-amber-500" />
            <span className="font-mono tabular-nums">{rating.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">({reviews})</span>
          </div>
        )}
      </header>

      {/* Bio + meta */}
      {(profile.planner_profile?.bio || profile.vendor_profile?.bio) && (
        <p className="rounded-2xl border border-brand-line bg-white/80 px-5 py-4 text-sm text-muted-foreground">
          {profile.planner_profile?.bio ?? profile.vendor_profile?.bio}
        </p>
      )}

      {(profile.planner_profile || profile.vendor_profile) && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-line bg-white/80 px-5 py-4">
          <div>
            <p className="text-sm font-medium">
              {verified
                ? t("verificationStateOn")
                : t("verificationStateOff")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("verificationHint")}
            </p>
          </div>
          <Button
            size="sm"
            variant={verified ? "outline" : "default"}
            disabled={setVerified.isPending}
            onClick={() =>
              setVerified.mutate({
                userId: profile.id,
                kind: profile.planner_profile ? "planner" : "vendor",
                verified: !verified,
              })
            }
            className="gap-1.5"
          >
            {setVerified.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : verified ? (
              <ShieldOff className="size-3.5" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}
            {verified ? t("unverifyAction") : t("verifyAction")}
          </Button>
        </div>
      )}

      {profile.role === "client" && (
        <Section title={t("clientEvents")}>
          {events.length === 0 ? (
            <Empty>{t("noEvents")}</Empty>
          ) : (
            <ul className="divide-y divide-rose-100/70">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.event_type} · {e.status}
                      {e.event_date &&
                        ` · ${f.date(e.event_date, "medium")}`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {f.relativeTime(e.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {profile.role === "planner" && (
        <>
          <Section title={t("plannerEvents")}>
            {plannerEvents.length === 0 ? (
              <Empty>{t("noEvents")}</Empty>
            ) : (
              <ul className="divide-y divide-rose-100/70">
                {plannerEvents.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.event_type} · {e.status}
                        {e.event_date &&
                          ` · ${f.date(e.event_date, "medium")}`}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {f.relativeTime(e.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={t("plannerProposals")}>
            {plannerProposals.length === 0 ? (
              <Empty>{t("noProposals")}</Empty>
            ) : (
              <ul className="divide-y divide-rose-100/70">
                {plannerProposals.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.event.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {p.status}
                        {p.accepted_at &&
                          ` · ${t("acceptedAt", { date: f.date(p.accepted_at, "medium") })}`}
                      </p>
                    </div>
                    <span className="font-mono text-sm tabular-nums">
                      {p.quote_amount
                        ? f.currency(
                            Number(p.quote_amount),
                            p.quote_currency,
                          )
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {profile.role === "vendor" && (
        <Section title={t("vendorEngagements")}>
          {vendorEngagements.length === 0 ? (
            <Empty>{t("noEngagements")}</Empty>
          ) : (
            <ul className="divide-y divide-rose-100/70">
              {vendorEngagements.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.planner.business_name} · {e.event.title} ·{" "}
                      <span className="capitalize">{e.status}</span>
                    </p>
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {f.currency(Number(e.total_amount), e.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-brand-line bg-white/80">
      <div className="border-b border-brand-line px-5 py-3">
        <p className="text-eyebrow font-medium text-rose-700/80">
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
