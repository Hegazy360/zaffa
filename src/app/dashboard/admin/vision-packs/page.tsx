"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Coins,
  Loader2,
  Sparkles,
  Undo2,
  Wallet,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useFormatters } from "@/lib/use-formatters";
import { minorToMajor } from "@/lib/vision-pack-pricing";

type StatusFilter =
  | "all"
  | "pending_payment"
  | "active"
  | "fulfilled"
  | "refunded"
  | "expired";

const STATUS_FILTERS: ReadonlyArray<StatusFilter> = [
  "all",
  "pending_payment",
  "active",
  "fulfilled",
  "refunded",
  "expired",
];

const STATUS_LABEL_KEY: Record<StatusFilter, string> = {
  all: "visionPacksFilterAll",
  pending_payment: "visionPacksFilterPending",
  active: "visionPacksFilterActive",
  fulfilled: "visionPacksFilterFulfilled",
  refunded: "visionPacksFilterRefunded",
  expired: "visionPacksFilterExpired",
};

const STATUS_TONE: Record<StatusFilter, string> = {
  all: "bg-rose-50 text-rose-700",
  pending_payment: "bg-amber-50 text-amber-800",
  active: "bg-emerald-50 text-emerald-800",
  fulfilled: "bg-rose-50 text-rose-800",
  refunded: "bg-zinc-100 text-zinc-700",
  expired: "bg-zinc-100 text-zinc-600",
};

export default function AdminVisionPacksPage() {
  const t = useTranslations("admin");
  const f = useFormatters();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const list = trpc.admin.listVisionPacks.useInfiniteQuery(
    {
      status: status === "all" ? undefined : status,
      query: query.trim().length > 0 ? query.trim() : undefined,
      limit: 50,
    },
    {
      getNextPageParam: (last) => last.nextCursor,
    },
  );

  const items = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          {t("visionPacksHeader")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("visionPacksSubtitle")}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => {
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-white/80 text-rose-700 hover:bg-rose-50"
              }`}
            >
              {t(STATUS_LABEL_KEY[s])}
            </button>
          );
        })}
        <div className="ms-auto w-full max-w-xs">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("visionPacksSearchPlaceholder")}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
        {list.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {t("visionPacksEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {items.map((row) => (
              <PackRow key={row.id} row={row} />
            ))}
          </ul>
        )}

        {list.hasNextPage ? (
          <div className="border-t border-rose-100/70 px-5 py-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("visionPackLoadMore")
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
        <Wallet className="me-1 inline size-3" />
        {f.number(items.length)} packs loaded
      </p>
    </div>
  );
}

type PackRowItem =
  inferRouterOutputs<AppRouter>["admin"]["listVisionPacks"]["items"][number];

function PackRow({ row }: { row: PackRowItem }) {
  const t = useTranslations("admin");
  const f = useFormatters();
  const statusKey = row.status as StatusFilter;
  // VisionPack.amount is stored in minor units (cents/piastres) — convert
  // before handing to the locale-aware currency formatter so e.g. 1999
  // renders as "$19.99" instead of "$1,999".
  const amountLabel = f.currency(
    minorToMajor(Number(row.amount), row.currency),
    row.currency,
  );

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-rose-600" aria-hidden />
          <p className="font-medium">
            {row.recipient?.full_name ??
              row.buyer?.full_name ??
              row.microsite_slug ??
              row.id.slice(0, 8)}
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_TONE[statusKey] ?? "bg-zinc-100 text-zinc-700"}`}
          >
            {t(STATUS_LABEL_KEY[statusKey] ?? "visionPacksFilterAll")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {row.buyer?.full_name ? (
            <>
              {t("visionPackBuyer")}: {row.buyer.full_name} ·{" "}
            </>
          ) : null}
          {row.paid_at ? (
            <>
              {t("visionPackPaid", { date: f.date(row.paid_at, "medium") })}
              {" · "}
            </>
          ) : null}
          {row.expires_at ? (
            <>
              {t("visionPackExpiresAt", {
                date: f.date(row.expires_at, "medium"),
              })}
            </>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("visionPackQuotaRenders", {
            used: row.renders_used,
            quota: row.renders_quota,
          })}{" "}
          ·{" "}
          {t("visionPackQuotaVideos", {
            used: row.videos_used,
            quota: row.videos_quota,
          })}
          {row.microsite_published_at ? (
            <span className="ms-2 inline-flex items-center gap-0.5 text-emerald-700">
              · {t("visionPackPublished")}
            </span>
          ) : null}
          {row.lookbook_downloaded_at ? (
            <span className="ms-2 inline-flex items-center gap-0.5 text-amber-800">
              · {t("visionPackLookbookDownloaded")}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <p className="font-mono text-sm tabular-nums">{amountLabel}</p>
        {row.microsite_slug ? (
          <Link
            href={`/v/${row.microsite_slug}`}
            target="_blank"
            className="inline-flex size-8 items-center justify-center rounded-md border border-rose-100/70 bg-white/80 text-rose-700 transition hover:bg-rose-50"
            title={t("visionPackOpenMicrosite")}
          >
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
        {row.event ? (
          <Link
            href={`/dashboard/client/events/${row.event.id}`}
            target="_blank"
            className="hidden text-xs text-rose-700 hover:underline sm:inline"
          >
            {t("visionPackOpenEvent")}
          </Link>
        ) : null}
        <TopUpDialog packId={row.id} status={row.status} />
        {row.status !== "refunded" && row.stripe_payment_intent_id ? (
          <RefundDialog packId={row.id} amountLabel={amountLabel} />
        ) : null}
      </div>
    </li>
  );
}

function RefundDialog({
  packId,
  amountLabel,
}: {
  packId: string;
  amountLabel: string;
}) {
  const t = useTranslations("admin");
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const refund = trpc.admin.refundVisionPack.useMutation({
    onSuccess: () => {
      toast.success(t("visionPackRefundedToast", { amount: amountLabel }));
      setOpen(false);
      setReason("");
      void utils.admin.listVisionPacks.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="outline" className="gap-1" />}
      >
        <Undo2 className="size-3.5" aria-hidden />
        {t("visionPackRefundCta")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("visionPackRefundDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("visionPackRefundDialogDesc", { amount: amountLabel })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`pack-refund-reason-${packId}`}>
            {t("visionPackRefundReasonLabel")}
          </Label>
          <Textarea
            id={`pack-refund-reason-${packId}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("visionPackRefundReasonPlaceholder")}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={refund.isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              refund.mutate({
                packId,
                reason: reason.trim() || undefined,
              })
            }
            disabled={refund.isPending}
          >
            {refund.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("visionPackRefundConfirm", { amount: amountLabel })
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TopUpDialog({
  packId,
  status,
}: {
  packId: string;
  status: PackRowItem["status"];
}) {
  const t = useTranslations("admin");
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [renders, setRenders] = useState(0);
  const [videos, setVideos] = useState(0);
  const [extend, setExtend] = useState(0);
  const topUp = trpc.admin.topUpVisionPackQuota.useMutation({
    onSuccess: () => {
      toast.success(t("visionPackTopUpToast"));
      setOpen(false);
      setRenders(0);
      setVideos(0);
      setExtend(0);
      void utils.admin.listVisionPacks.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (status === "refunded") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="outline" className="gap-1" />}
      >
        <Coins className="size-3.5" aria-hidden />
        {t("visionPackTopUpCta")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("visionPackTopUpDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("visionPackTopUpDialogDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={`pack-renders-${packId}`}>
              {t("visionPackTopUpRendersLabel")}
            </Label>
            <Input
              id={`pack-renders-${packId}`}
              type="number"
              min={0}
              max={100}
              value={renders}
              onChange={(e) => setRenders(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`pack-videos-${packId}`}>
              {t("visionPackTopUpVideosLabel")}
            </Label>
            <Input
              id={`pack-videos-${packId}`}
              type="number"
              min={0}
              max={20}
              value={videos}
              onChange={(e) => setVideos(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`pack-extend-${packId}`}>
              {t("visionPackTopUpExtendLabel")}
            </Label>
            <Input
              id={`pack-extend-${packId}`}
              type="number"
              min={0}
              max={180}
              value={extend}
              onChange={(e) => setExtend(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={topUp.isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              topUp.mutate({
                packId,
                addRenders: renders,
                addVideos: videos,
                extendDays: extend,
              })
            }
            disabled={
              topUp.isPending ||
              (renders === 0 && videos === 0 && extend === 0)
            }
          >
            {topUp.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("visionPackTopUpConfirm")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
