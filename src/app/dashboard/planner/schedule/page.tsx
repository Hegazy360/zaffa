"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface BookedEvent {
  id: string;
  title: string;
  event_date: Date | null;
  venue: string | null;
  palette: unknown;
}

interface PlannerBlock {
  id: string;
  start_date: Date;
  end_date: Date;
  reason: string | null;
}

function startOfMonthGrid(year: number, month: number) {
  // month is 0-11
  const first = new Date(Date.UTC(year, month, 1));
  const dayOfWeek = first.getUTCDay(); // 0=Sun..6=Sat
  // Build a 6-week grid starting on Sunday
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - dayOfWeek);
  return start;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function dateToInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function inputToUTCDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function paletteAccent(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.colors)) {
      const first = obj.colors.find((c) => typeof c === "string");
      if (typeof first === "string") return first;
    }
  }
  return "#e11d48";
}

const WEEKDAY_KEYS = [
  "weekdayShortSun",
  "weekdayShortMon",
  "weekdayShortTue",
  "weekdayShortWed",
  "weekdayShortThu",
  "weekdayShortFri",
  "weekdayShortSat",
] as const;

export default function SchedulePage() {
  const t = useTranslations("planner");
  const locale = useLocale();
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(), // 0-11
  });

  const { data, isLoading } = trpc.availability.forMonth.useQuery({
    year: cursor.year,
    month: cursor.month + 1,
  });

  const utils = trpc.useUtils();
  const [blockDialog, setBlockDialog] = useState<
    | { mode: "create"; defaultDate?: Date }
    | { mode: "edit"; block: PlannerBlock }
    | null
  >(null);

  const deleteBlock = trpc.availability.deleteBlock.useMutation({
    onSuccess: () => {
      toast.success(t("blockRemovedToast"));
      utils.availability.forMonth.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const monthLabel = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG" : "en-EG",
    { month: "long", year: "numeric" },
  ).format(new Date(Date.UTC(cursor.year, cursor.month, 1)));

  // Build a 6x7 grid of dates
  const grid = useMemo(() => {
    const start = startOfMonthGrid(cursor.year, cursor.month);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      cells.push(d);
    }
    return cells;
  }, [cursor]);

  const bookings = data?.bookedEvents ?? [];
  const blocks = data?.blocks ?? [];

  function dayBookings(d: Date): BookedEvent[] {
    return bookings.filter((b) =>
      b.event_date ? isSameDay(new Date(b.event_date), d) : false
    );
  }

  function dayBlocks(d: Date): PlannerBlock[] {
    return blocks.filter(
      (b) =>
        new Date(b.start_date).getTime() <= d.getTime() &&
        new Date(b.end_date).getTime() >= d.getTime()
    );
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-rose-700 backdrop-blur-sm">
              <CalendarDays className="size-3" />
              {t("scheduleEyebrow")}
            </div>
            <h1 className="font-display mt-3 text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
              {monthLabel}
            </h1>
            <p className="mt-2 max-w-xl text-pretty text-sm text-muted-foreground">
              {t("scheduleSubtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() =>
                setCursor((c) =>
                  c.month === 0
                    ? { year: c.year - 1, month: 11 }
                    : { ...c, month: c.month - 1 }
                )
              }
            >
              <ChevronLeft className="size-4 rtl:-scale-x-100" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCursor({
                  year: today.getFullYear(),
                  month: today.getMonth(),
                })
              }
            >
              {t("today")}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() =>
                setCursor((c) =>
                  c.month === 11
                    ? { year: c.year + 1, month: 0 }
                    : { ...c, month: c.month + 1 }
                )
              }
            >
              <ChevronRight className="size-4 rtl:-scale-x-100" />
            </Button>
            <Button
              onClick={() => setBlockDialog({ mode: "create" })}
              className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
            >
              <Plus className="size-4" />
              {t("blockDates")}
            </Button>
          </div>
        </header>

        <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/70 backdrop-blur-sm">
          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-rose-100/70 bg-rose-50/40 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {WEEKDAY_KEYS.map((key) => (
              <div key={key} className="px-2 py-2 text-center">
                {t(key)}
              </div>
            ))}
          </div>

          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-rose-500" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {grid.map((d) => {
                const inMonth = d.getUTCMonth() === cursor.month;
                const isToday = isSameDay(
                  new Date(
                    Date.UTC(
                      today.getFullYear(),
                      today.getMonth(),
                      today.getDate()
                    )
                  ),
                  d
                );
                const dayBks = dayBookings(d);
                const dayBlk = dayBlocks(d);

                return (
                  <div
                    key={d.toISOString()}
                    className={cn(
                      "relative min-h-[110px] border-b border-e border-rose-100/70 p-2 text-xs",
                      !inMonth && "bg-stone-50/40 text-muted-foreground/70"
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex size-6 items-center justify-center rounded-full text-[11px]",
                          isToday
                            ? "bg-gradient-to-br from-rose-500 to-amber-500 font-medium text-white"
                            : "text-foreground/80"
                        )}
                      >
                        {d.getUTCDate()}
                      </span>
                      {inMonth && (
                        <button
                          onClick={() =>
                            setBlockDialog({ mode: "create", defaultDate: d })
                          }
                          className="opacity-0 transition-opacity hover:text-rose-700 group-hover:opacity-100"
                          aria-label={t("blockThisDay")}
                        >
                          <Plus className="size-3" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      {dayBks.map((b) => {
                        const accent = paletteAccent(b.palette);
                        return (
                          <Link
                            key={b.id}
                            href={`/dashboard/planner/event/${b.id}`}
                            className="flex items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-[10px] font-medium ring-1 ring-foreground/5"
                            style={{
                              backgroundColor: `${accent}1a`,
                              color: accent,
                            }}
                          >
                            <span
                              aria-hidden
                              className="block size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: accent }}
                            />
                            <span className="truncate">{b.title}</span>
                          </Link>
                        );
                      })}
                      {dayBlk.map((b) => (
                        <button
                          key={b.id}
                          onClick={() =>
                            setBlockDialog({ mode: "edit", block: b })
                          }
                          className="flex w-full items-center gap-1.5 truncate rounded-md bg-stone-200/80 px-1.5 py-1 text-start text-[10px] font-medium text-stone-700 ring-1 ring-stone-300/60 hover:bg-stone-200"
                        >
                          <span
                            aria-hidden
                            className="block size-1.5 shrink-0 rounded-full bg-stone-500"
                          />
                          <span className="truncate">
                            {b.reason ?? t("blockedFallback")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Dialog
          open={blockDialog !== null}
          onOpenChange={(o) => !o && setBlockDialog(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl font-light tracking-tight">
                {blockDialog?.mode === "edit"
                  ? t("editBlock")
                  : t("blockDates")}
              </DialogTitle>
              <DialogDescription>
                {t("blockDatesDialogDesc")}
              </DialogDescription>
            </DialogHeader>
            {blockDialog && (
              <BlockForm
                key={blockDialog.mode === "edit" ? blockDialog.block.id : "create"}
                initial={
                  blockDialog.mode === "edit"
                    ? blockDialog.block
                    : blockDialog.defaultDate
                      ? {
                          start_date: blockDialog.defaultDate,
                          end_date: blockDialog.defaultDate,
                          reason: null,
                        }
                      : null
                }
                onDone={() => {
                  setBlockDialog(null);
                  utils.availability.forMonth.invalidate();
                }}
                onDelete={
                  blockDialog.mode === "edit"
                    ? () => {
                        deleteBlock.mutate({ id: blockDialog.block.id });
                        setBlockDialog(null);
                      }
                    : undefined
                }
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function BlockForm({
  initial,
  onDone,
  onDelete,
}: {
  initial: { id?: string; start_date: Date; end_date: Date; reason: string | null } | null;
  onDone: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("planner");
  const [start, setStart] = useState(
    initial ? dateToInputValue(new Date(initial.start_date)) : ""
  );
  const [end, setEnd] = useState(
    initial ? dateToInputValue(new Date(initial.end_date)) : ""
  );
  const [reason, setReason] = useState(initial?.reason ?? "");

  const create = trpc.availability.createBlock.useMutation({
    onSuccess: () => {
      toast.success(t("datesBlockedToast"));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.availability.updateBlock.useMutation({
    onSuccess: () => {
      toast.success(t("blockUpdatedToast"));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitting = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) {
      toast.error(t("pickStartEndError"));
      return;
    }
    const startDate = inputToUTCDate(start);
    const endDate = inputToUTCDate(end);
    if (initial?.id) {
      update.mutate({
        id: initial.id,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
      });
    } else {
      create.mutate({
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="start">{t("startLabel")}</Label>
          <Input
            id="start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end">{t("endLabel")}</Label>
          <Input
            id="end"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reason">{t("reasonOptionalLabel")}</Label>
        <Input
          id="reason"
          placeholder={t("reasonPlaceholder")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={280}
        />
      </div>
      <DialogFooter>
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            className="me-auto text-stone-600 hover:text-rose-700"
            onClick={onDelete}
          >
            <Trash2 className="me-1 size-3.5" />
            {t("removeAction")}
          </Button>
        )}
        <DialogClose render={<Button type="button" variant="outline" />}>
          {t("cancelAction")}
        </DialogClose>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-gradient-to-r from-rose-600 to-amber-500 text-white"
        >
          {submitting ? (
            <Loader2 className="me-2 size-4 animate-spin" />
          ) : null}
          {initial?.id ? t("saveBlock") : t("blockDates")}
        </Button>
      </DialogFooter>
    </form>
  );
}
