"use client";

import Link from "next/link";
import { use } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  RotateCw,
  Star,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";
import {
  prospectDisplayName,
  prospectInitial,
} from "@/lib/prospect-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function DiscoveryRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const t = useTranslations("admin");
  const f = useFormatters();
  const utils = trpc.useUtils();
  const detail = trpc.discovery.runById.useQuery(
    { id: runId },
    { refetchInterval: (q) =>
        q.state.data?.status === "running" || q.state.data?.status === "queued"
          ? 3000
          : false,
    },
  );
  const retry = trpc.discovery.retry.useMutation({
    onSuccess: () => {
      toast.success(t("runRequeued"));
      utils.discovery.runById.invalidate({ id: runId });
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
      <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted-foreground">
        {t("runNotFound")}
      </p>
    );
  }

  const run = detail.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/admin/discovery"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 hover:underline"
      >
        <ArrowLeft className="size-3 rtl:-scale-x-100" />
        {t("backToDiscovery")}
      </Link>

      <header>
        <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          {t(`prospectSource.${run.source}`)} · {run.query_type}
          {run.depth && run.depth !== "standard" && (
            <> · {t(`depthLabel.${run.depth}`)}</>
          )}
        </p>
        <h1 className="font-display text-2xl font-light tracking-tight">
          {run.query}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("runStatusLabel", { status: t(`runStatus.${run.status}`) })}
          {run.completed_at &&
            ` · ${f.relativeTime(run.completed_at)}`}
          {` · ${run.prospects_new} ${t("newProspects")} / ${run.prospects_found} ${t("foundCount")}`}
        </p>
        {run.status === "failed" && run.error && (
          <div className="mt-3 inline-flex max-w-full items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200">
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="break-all">{run.error}</span>
          </div>
        )}
        {(run.status === "failed" || run.status === "queued") && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => retry.mutate({ id: runId })}
              disabled={retry.isPending}
            >
              <RotateCw className="me-1 size-3.5" />
              {t("retry")}
            </Button>
          </div>
        )}
      </header>

      <section className="rounded-2xl border border-rose-100/70 bg-white/80">
        <div className="border-b border-rose-100/70 px-5 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            {t("prospectsFromRun")}
          </p>
        </div>
        {run.prospects.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {t("runNoProspects")}
          </p>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {run.prospects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/admin/prospects/${p.id}`}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-rose-50/40"
                >
                  <Avatar className="size-9">
                    {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                    <AvatarFallback>{prospectInitial(p)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-medium">{prospectDisplayName(p)}</p>
                      {p.qualifying_score != null && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-[10px] text-amber-800">
                          <Star className="size-2.5 fill-amber-500 text-amber-500" />
                          {p.qualifying_score}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="capitalize">
                        {t(`prospectType.${p.prospect_type}`)}
                      </span>
                      {p.vendor_category && ` · ${p.vendor_category}`}
                      {p.handle && ` · @${p.handle}`}
                      {` · ${t(`prospectStatus.${p.status}`)}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
