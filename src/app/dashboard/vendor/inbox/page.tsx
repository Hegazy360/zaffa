"use client";

import Link from "next/link";
import { CheckCircle2, Inbox as InboxIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { decimalToNumber } from "@/lib/payments";

import { useFormatters } from "@/lib/use-formatters";
type EngagementStatus =
  | "draft"
  | "requested"
  | "accepted"
  | "declined"
  | "active"
  | "completed"
  | "cancelled";

const STATUS_KEY: Record<EngagementStatus, string> = {
  draft: "statusDraft",
  requested: "statusRequested",
  accepted: "statusAccepted",
  declined: "statusDeclined",
  active: "statusActive",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
};

const STATUS_TONE: Record<EngagementStatus, string> = {
  draft: "bg-stone-100 text-stone-700",
  requested: "bg-rose-100 text-rose-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-stone-100 text-stone-700",
  active: "bg-amber-100 text-amber-900",
  completed: "bg-stone-100 text-stone-700",
  cancelled: "bg-stone-100 text-stone-500",
};

export default function VendorInboxPage() {
  const utils = trpc.useUtils();
  const f = useFormatters();
  const t = useTranslations("vendor");
  const incoming = trpc.vendorEngagements.incoming.useQuery();
  const respond = trpc.vendorEngagements.vendorRespond.useMutation({
    onSuccess: () => {
      toast.success(t("responseSentToast"));
      utils.vendorEngagements.incoming.invalidate();
      utils.vendors.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (incoming.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  const items = incoming.data ?? [];
  const pending = items.filter((e) => e.status === "requested");
  const others = items.filter((e) => e.status !== "requested");

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
            {t("inboxLabel")}
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
            {t("inboxRequestsTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("inboxRequestsSubtitle")}
          </p>
        </header>

        {pending.length === 0 && others.length === 0 ? (
          <div className="rounded-2xl border border-brand-line bg-white/70 p-12 text-center backdrop-blur-sm">
            <InboxIcon className="mx-auto mb-3 size-8 text-rose-500" />
            <p className="font-display text-xl font-light tracking-tight">
              {t("inboxZero")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("inboxZeroBody")}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {pending.length > 0 && (
              <Section title={t("awaitingResponseSection")}>
                <ul className="space-y-3">
                  {pending.map((e) => (
                    <EngagementCard
                      key={e.id}
                      engagement={e}
                      onAccept={() =>
                        respond.mutate({ id: e.id, accept: true })
                      }
                      onDecline={() =>
                        respond.mutate({ id: e.id, accept: false })
                      }
                      pending={respond.isPending}
                    />
                  ))}
                </ul>
              </Section>
            )}
            {others.length > 0 && (
              <Section title={t("recentActivity")}>
                <ul className="space-y-3">
                  {others.map((e) => (
                    <EngagementCard key={e.id} engagement={e} />
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
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
    <section>
      <h2 className="mb-3 text-eyebrow font-medium text-rose-700/80">
        {title}
      </h2>
      {children}
    </section>
  );
}

interface EngagementCardProps {
  engagement: {
    id: string;
    title: string;
    notes: string | null;
    status: EngagementStatus;
    currency: string;
    total_amount: unknown;
    requested_at: Date | string | null;
    event: { id: string; title: string; event_date: Date | string | null };
    planner: {
      id: string;
      business_name: string;
      profile: { full_name: string; avatar_url: string | null };
    };
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      quantity: number;
      unit_price: unknown;
      line_total: unknown;
    }>;
  };
  onAccept?: () => void;
  onDecline?: () => void;
  pending?: boolean;
}

function EngagementCard({
  engagement,
  onAccept,
  onDecline,
  pending,
}: EngagementCardProps) {
  const f = useFormatters();
  const t = useTranslations("vendor");
  const status = engagement.status;
  return (
    <li className="overflow-hidden rounded-2xl border border-brand-line bg-white/85 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-line px-5 py-4">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/dashboard/vendor/engagements/${engagement.id}`}
            className="block"
          >
            <p className="truncate text-base font-medium leading-tight">
              {engagement.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {engagement.planner.business_name} · {engagement.event.title}
              {engagement.event.event_date && (
                <> · {f.date(engagement.event.event_date, "medium")}</>
              )}
            </p>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wider ${STATUS_TONE[status]}`}
          >
            {t(STATUS_KEY[status])}
          </span>
          <span className="font-mono text-sm tabular-nums">
            {f.currency(
              decimalToNumber(engagement.total_amount),
              engagement.currency,
            )}
          </span>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        {engagement.notes && (
          <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-700">
            {engagement.notes}
          </p>
        )}
        <ul className="divide-y divide-rose-100/70 rounded-xl border border-brand-line">
          {engagement.items.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate">{i.name}</p>
                {i.description && (
                  <p className="truncate text-xs text-muted-foreground">
                    {i.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span>×{i.quantity}</span>
                <span className="font-mono tabular-nums">
                  {f.currency(
                    decimalToNumber(i.line_total),
                    engagement.currency,
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {status === "requested" && (
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={onDecline}
              className="gap-1"
            >
              <X className="size-3.5" />
              {t("decline")}
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={onAccept}
              className="gap-1 bg-brand-gradient text-white"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              {t("accept")}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
