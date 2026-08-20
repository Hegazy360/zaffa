"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatMoneyDate } from "@/lib/money-format";

/**
 * The couple's view of their concierge package.
 *
 * Reads the schedule-less `Payment` rows written by `enquiries.createQuote`.
 * `SchedulePanel` can't serve this: it's welded to `PaymentSchedule`, which
 * requires a proposal and a planner — neither exists on this lane.
 *
 * Renders nothing at all when there is no package, so it can sit
 * unconditionally on the event page for every client.
 */
export function ConciergePackageCard({ eventId }: { eventId: string }) {
  const t = useTranslations("concierge");
  const locale = useLocale();
  const q = trpc.payments.conciergeForEvent.useQuery({ eventId });

  const rows = q.data ?? [];
  if (q.isLoading || rows.length === 0) return null;

  const money = (amount: number, currency: string) =>
    formatMoney(amount, currency, locale);
  const dateFmt = (d: string | Date) => formatMoneyDate(d, locale);

  return (
    <section className="rounded-2xl border border-rose-100 bg-white/70 p-5">
      <h2 className="font-display text-xl font-light tracking-tight">
        {t("packageTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("packageSubtitle")}</p>

      <ul className="mt-4 divide-y divide-rose-100">
        {rows.map((p) => {
          const isPaid = p.status === "paid";
          const canPay = !isPaid && Boolean(p.payment_link_url);
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {p.label ?? "—"}
                  {isPaid && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      <Check className="size-3" />
                      {t("paid")}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isPaid
                    ? p.paid_at
                      ? dateFmt(p.paid_at)
                      : t("paid")
                    : p.due_date
                      ? t("due", { date: dateFmt(p.due_date) })
                      : canPay
                        ? t("awaiting")
                        : t("pending")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "font-display text-lg",
                    isPaid && "text-muted-foreground line-through",
                  )}
                >
                  <bdi>{money(Number(p.amount), p.currency)}</bdi>
                </span>
                {canPay && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
                    render={
                      <a
                        href={p.payment_link_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    {t("pay")}
                    <ExternalLink className="size-3.5" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
