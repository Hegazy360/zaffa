"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Facebook,
  Globe,
  Instagram,
  Loader2,
  MapPin,
  Music2,
  Play,
  RotateCw,
  Search,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Source = "instagram" | "tiktok" | "facebook" | "directory" | "web";
const SOURCE_VALUES: Source[] = [
  "web",
  "instagram",
  "tiktok",
  "facebook",
  "directory",
];

type Depth = "quick" | "standard" | "deep";
const DEPTH_VALUES: Depth[] = ["quick", "standard", "deep"];

export default function AdminDiscoveryPage() {
  const t = useTranslations("admin");
  const f = useFormatters();
  const utils = trpc.useUtils();
  const seeds = trpc.discovery.seedQueries.useQuery();
  const runs = trpc.discovery.runs.useQuery(
    { limit: 30 },
    { refetchInterval: 5_000 },
  );

  const [source, setSource] = useState<Source>("web");
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<Depth>("standard");

  const enqueue = trpc.discovery.enqueue.useMutation({
    onSuccess: () => {
      toast.success(t("runQueued"));
      utils.discovery.runs.invalidate();
      setQuery("");
    },
    onError: (e) => toast.error(e.message),
  });
  const retry = trpc.discovery.retry.useMutation({
    onSuccess: () => {
      toast.success(t("runRequeued"));
      utils.discovery.runs.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          {t("discoveryTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("discoveryDesc")}
        </p>
      </header>

      <section className="rounded-2xl border border-brand-line bg-white/80 px-5 py-5">
        <p className="mb-3 text-eyebrow font-medium text-rose-700/80">
          {t("runNow")}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!query.trim()) return;
            enqueue.mutate({
              source,
              query: query.trim(),
              query_type:
                source === "instagram"
                  ? // IG profile URLs can only contain ASCII handle chars,
                    // so anything else (multi-word, Arabic, etc.) MUST be
                    // routed through hashtag mode. Only an explicit `@`
                    // prefix forces a profile lookup.
                    query.trim().startsWith("@")
                    ? "search"
                    : "hashtag"
                  : source === "tiktok"
                    ? "search"
                    : source === "directory"
                      ? /^https?:\/\//i.test(query.trim())
                        ? "url"
                        : "zafaf"
                      : "search",
              depth,
              runNow: true,
            });
          }}
          className="grid gap-3 sm:grid-cols-[160px_1fr_140px_auto] sm:items-end"
        >
          <div className="space-y-1.5">
            <Label>{t("source")}</Label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {SOURCE_VALUES.map((s) => (
                <option key={s} value={s}>
                  {t(`prospectSource.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("query")}</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("queryPlaceholder")}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label title={t("depthHelp")}>{t("depth")}</Label>
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value as Depth)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              title={t(`depthHint.${depth}`)}
            >
              {DEPTH_VALUES.map((d) => (
                <option key={d} value={d}>
                  {t(`depthLabel.${d}`)}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            disabled={enqueue.isPending || !query.trim()}
            className="h-9 bg-brand-gradient text-white"
          >
            {enqueue.isPending ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Play className="me-2 size-4" />
            )}
            {t("runDiscovery")}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(`depthHint.${depth}`)}
        </p>

        {seeds.data && (
          <div className="mt-5 space-y-3">
            <p className="text-eyebrow font-medium text-rose-700/80">
              {t("seedQueries")}
            </p>
            {seeds.data.map((group) => (
              <div key={group.source}>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <SourceIcon source={group.source} />
                  <span className="capitalize">
                    {t(`prospectSource.${group.source}`)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.queries.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setSource(group.source as Source);
                        setQuery(q);
                      }}
                      className="rounded-full border border-brand-line bg-white/70 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-rose-50/60 hover:text-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-brand-line bg-white/80">
        <div className="flex items-center justify-between border-b border-brand-line px-5 py-3">
          <p className="text-eyebrow font-medium text-rose-700/80">
            {t("recentRuns")}
          </p>
          {runs.isFetching && (
            <Loader2 className="size-3.5 animate-spin text-rose-500" />
          )}
        </div>
        {runs.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : (runs.data?.length ?? 0) === 0 ? (
          <div className="px-5 py-12 text-center">
            <Search className="mx-auto mb-2 size-6 text-rose-500" />
            <p className="text-sm text-muted-foreground">
              {t("noRunsYet")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {runs.data!.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <Link
                  href={`/dashboard/admin/discovery/${r.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
                >
                  <SourceIcon source={r.source} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {r.query}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`prospectSource.${r.source}`)} · {r.query_type}
                      {r.depth && r.depth !== "standard" && (
                        <> · {t(`depthLabel.${r.depth}`)}</>
                      )}
                      {r.completed_at && ` · ${f.relativeTime(r.completed_at)}`}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-end text-xs">
                    <span className="font-mono tabular-nums">
                      {r.prospects_new}/{r.prospects_found}
                    </span>
                    <span className="ms-1 text-muted-foreground">
                      {t("newOverFound")}
                    </span>
                  </span>
                  <RunStatus status={r.status} />
                  {(r.status === "failed" || r.status === "queued") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => retry.mutate({ id: r.id })}
                      disabled={retry.isPending}
                    >
                      <RotateCw className="size-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SourceIcon({ source }: { source: string }) {
  const Icon =
    source === "instagram"
      ? Instagram
      : source === "tiktok"
        ? Music2
        : source === "facebook"
          ? Facebook
          : source === "directory"
            ? MapPin
            : Globe;
  return <Icon className="size-4 text-rose-600" />;
}

function RunStatus({ status }: { status: string }) {
  const t = useTranslations("admin");
  const Icon =
    status === "completed"
      ? CheckCircle2
      : status === "running"
        ? Loader2
        : status === "failed"
          ? AlertCircle
          : Clock;
  const tone =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "running"
        ? "bg-blue-50 text-blue-700 ring-blue-200"
        : status === "failed"
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-stone-100 text-stone-700 ring-stone-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${tone}`}
    >
      <Icon
        className={`size-2.5 ${status === "running" ? "animate-spin" : ""}`}
      />
      {t(`runStatus.${status}`)}
    </span>
  );
}
