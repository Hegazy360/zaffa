"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Facebook,
  Globe,
  Instagram,
  Loader2,
  Mail,
  MapPin,
  Music2,
  Phone,
  Plus,
  Search,
  Star,
  UserRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useFormatters } from "@/lib/use-formatters";
import {
  prospectDisplayName,
  prospectInitial,
} from "@/lib/prospect-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { QuickSendWhatsapp } from "@/components/features/prospects/quick-send-whatsapp";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const SOURCES = [
  "all",
  "instagram",
  "tiktok",
  "facebook",
  "directory",
  "web",
  "manual",
] as const;
const TYPES = ["all", "planner", "vendor", "unknown"] as const;
const STATUSES = [
  "all",
  "new",
  "qualified",
  "drafted",
  "contacted",
  "replied",
  "signed_up",
  "rejected",
] as const;

const VENDOR_CATEGORIES = [
  "catering",
  "photography",
  "videography",
  "flowers",
  "music",
  "decoration",
  "venue",
  "makeup",
  "fashion",
  "transportation",
  "other",
] as const;

export default function AdminProspectsPage() {
  const t = useTranslations("admin");
  const f = useFormatters();
  const [q, setQ] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("all");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");

  const list = trpc.prospects.list.useQuery({
    q: q.trim() || undefined,
    source: source === "all" ? undefined : source,
    type: type === "all" ? undefined : type,
    status: status === "all" ? undefined : status,
    limit: 100,
  });
  const funnel = trpc.prospects.funnel.useQuery();

  // Stable client-side resort: WhatsApp-having rows first, preserving the
  // server's quality ordering inside each group. Cheaper than re-querying
  // and avoids the awkwardness of trying to do "nulls last" + secondary
  // sort against a unique nullable column in Postgres.
  const items = useMemo(() => {
    const raw = list.data?.items ?? [];
    return [...raw].sort((a, b) => {
      const aw = a.whatsapp ? 0 : 1;
      const bw = b.whatsapp ? 0 : 1;
      return aw - bw;
    });
  }, [list.data]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight">
            {t("prospectsListTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("prospectsListSubtitle")}
          </p>
        </div>
        <ManualEntryDialog />
      </header>

      {funnel.data && (
        <section className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          {(
            [
              "new",
              "qualified",
              "drafted",
              "contacted",
              "replied",
              "signed_up",
              "rejected",
            ] as const
          ).map((s) => (
            <div
              key={s}
              className="rounded-xl border border-brand-line bg-white/80 px-3 py-2 backdrop-blur-sm"
            >
              <p className="text-eyebrow font-medium text-rose-700/80">
                {t(`prospectStatus.${s}`)}
              </p>
              <p className="font-display text-2xl font-light tracking-tight">
                {funnel.data[s] ?? 0}
              </p>
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("prospectsSearchPlaceholder")}
            className="ps-9"
          />
        </div>
        <FilterRow
          label={t("filterSource")}
          values={SOURCES}
          active={source}
          setActive={setSource}
          renderLabel={(v) => t(`prospectSource.${v}`)}
        />
        <FilterRow
          label={t("filterType")}
          values={TYPES}
          active={type}
          setActive={setType}
          renderLabel={(v) => t(`prospectType.${v}`)}
        />
        <FilterRow
          label={t("filterStatus")}
          values={STATUSES}
          active={status}
          setActive={setStatus}
          renderLabel={(v) => t(`prospectStatus.${v}`)}
        />
      </div>

      {/* Subtle nudge so the W shortcut is discoverable. We only render it
          when there's at least one WA-eligible row, otherwise it's noise. */}
      {items.some((p) => p.whatsapp) && (
        <p className="-mb-2 ms-1 text-xs text-muted-foreground">
          {t.rich("quickSendKbHint", {
            kbd: (chunks) => (
              <kbd className="mx-0.5 inline-flex h-[18px] items-center rounded border border-rose-200/70 bg-white px-1.5 font-mono text-xs font-medium text-rose-700 shadow-sm">
                {chunks}
              </kbd>
            ),
          })}
        </p>
      )}

      <div className="rounded-2xl border border-brand-line bg-white/80">
        {list.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <UserRound className="mx-auto mb-2 size-6 text-rose-500" />
            <p className="text-sm text-muted-foreground">
              {t("prospectsEmpty")}
            </p>
          </div>
        ) : (
          <ul
            className="divide-y divide-rose-100/70"
            // Keyboard shortcut: "W" on a focused row fires WhatsApp send.
            // We listen at the ul level so any focused row Link bubbles up
            // here. Ignore when the user is typing in a form field that
            // somehow bubbled (defensive — search input is outside this ul).
            onKeyDown={(e) => {
              if (e.key !== "w" && e.key !== "W") return;
              if (e.metaKey || e.ctrlKey || e.altKey) return;
              const target = e.target as HTMLElement | null;
              if (
                target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                (target as HTMLElement)?.isContentEditable
              ) {
                return;
              }
              const row = target?.closest("li[data-prospect-row]");
              const btn = row?.querySelector<HTMLButtonElement>(
                "[data-quicksend-wa]",
              );
              if (!btn || btn.disabled) return;
              e.preventDefault();
              btn.click();
            }}
          >
            {items.map((p) => (
              <li key={p.id} data-prospect-row className="relative">
                <Link
                  href={`/dashboard/admin/prospects/${p.id}`}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3 transition-colors hover:bg-rose-50/40",
                    p.whatsapp && "pe-16",
                  )}
                >
                  <Avatar className="size-10">
                    {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                    <AvatarFallback>
                      {prospectInitial(p)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-medium">{prospectDisplayName(p)}</p>
                      {p.qualifying_score != null && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-xs text-amber-800">
                          <Star className="size-2.5 fill-amber-500 text-amber-500" />
                          {p.qualifying_score}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="capitalize">{t(`prospectType.${p.prospect_type}`)}</span>
                      {p.vendor_category && ` · ${p.vendor_category}`}
                      {p.handle && ` · @${p.handle}`}
                      {p.city && ` · ${p.city}`}
                      {p.followers != null &&
                        ` · ${f.number(p.followers)} ${t("followers")}`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <SourceBadge source={p.source} />
                      <StatusBadge status={p.status} />
                      {p.email && <Channel icon={<Mail className="size-3" />} />}
                      {p.whatsapp && <Channel icon={<Phone className="size-3" />} />}
                      {p.instagram && <Channel icon={<Instagram className="size-3" />} />}
                    </div>
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {f.relativeTime(p.created_at)}
                  </span>
                </Link>
                {/* Floats over the row link so we can fire WhatsApp without
                    navigating into the prospect detail page. The button
                    itself stops propagation/preventDefaults the click. */}
                {p.whatsapp && (
                  <div className="absolute end-4 top-1/2 -translate-y-1/2">
                    <QuickSendWhatsapp
                      prospectId={p.id}
                      whatsapp={p.whatsapp}
                      draft={p.draft_whatsapp}
                      variant="compact"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterRow<T extends string>({
  label,
  values,
  active,
  setActive,
  renderLabel,
}: {
  label: string;
  values: readonly T[];
  active: T;
  setActive: (v: T) => void;
  renderLabel: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-eyebrow font-medium text-rose-700/80">
        {label}
      </span>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setActive(v)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
            active === v
              ? "border-rose-300 bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-sm"
              : "border-brand-line bg-white/70 text-muted-foreground hover:bg-white"
          }`}
        >
          {renderLabel(v)}
        </button>
      ))}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const t = useTranslations("admin");
  const Icon =
    source === "instagram"
      ? Instagram
      : source === "tiktok"
        ? Music2
        : source === "facebook"
          ? Facebook
          : source === "web"
            ? Globe
            : source === "directory"
              ? MapPin
              : UserRound;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-rose-700 ring-1 ring-rose-200">
      <Icon className="size-2.5" />
      {t(`prospectSource.${source}`)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("admin");
  const tone =
    status === "signed_up"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : status === "replied"
        ? "bg-blue-50 text-blue-800 ring-blue-200"
        : status === "contacted"
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : status === "rejected"
            ? "bg-stone-100 text-stone-600 ring-stone-200"
            : "bg-rose-50 text-rose-800 ring-rose-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${tone}`}
    >
      {t(`prospectStatus.${status}`)}
    </span>
  );
}

function Channel({ icon }: { icon: React.ReactNode }) {
  return (
    <span className="inline-flex size-4 items-center justify-center rounded-full bg-stone-100 text-stone-700">
      {icon}
    </span>
  );
}

function ManualEntryDialog() {
  const t = useTranslations("admin");
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    handle: "",
    prospect_type: "unknown" as "planner" | "vendor" | "unknown",
    vendor_category: "" as string,
    email: "",
    whatsapp: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    website: "",
    city: "",
    bio: "",
    notes: "",
  });

  const create = trpc.prospects.addManual.useMutation({
    onSuccess: () => {
      toast.success(t("prospectAdded"));
      utils.prospects.list.invalidate();
      utils.prospects.funnel.invalidate();
      setOpen(false);
      setForm({
        display_name: "",
        handle: "",
        prospect_type: "unknown",
        vendor_category: "",
        email: "",
        whatsapp: "",
        instagram: "",
        facebook: "",
        tiktok: "",
        website: "",
        city: "",
        bio: "",
        notes: "",
      });
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.display_name.trim()) return;
    create.mutate({
      display_name: form.display_name.trim(),
      handle: form.handle.trim() || null,
      prospect_type: form.prospect_type,
      vendor_category: form.vendor_category
        ? (form.vendor_category as (typeof VENDOR_CATEGORIES)[number])
        : null,
      email: form.email.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      instagram: form.instagram.trim() || null,
      facebook: form.facebook.trim() || null,
      tiktok: form.tiktok.trim() || null,
      website: form.website.trim() || null,
      city: form.city.trim() || null,
      country: "EG",
      bio: form.bio.trim() || null,
      notes: form.notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="gap-1.5 bg-brand-gradient text-white" />
        }
      >
        <Plus className="size-4" />
        {t("addProspect")}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("addProspectTitle")}</DialogTitle>
          <DialogDescription>{t("addProspectDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t("displayName")} required>
            <Input
              value={form.display_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, display_name: e.target.value }))
              }
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("handle")}>
              <Input
                value={form.handle}
                onChange={(e) =>
                  setForm((f) => ({ ...f, handle: e.target.value }))
                }
                placeholder="@username"
              />
            </Field>
            <Field label={t("prospectTypeLabel")}>
              <select
                value={form.prospect_type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    prospect_type: e.target.value as
                      | "planner"
                      | "vendor"
                      | "unknown",
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="unknown">{t("prospectType.unknown")}</option>
                <option value="planner">{t("prospectType.planner")}</option>
                <option value="vendor">{t("prospectType.vendor")}</option>
              </select>
            </Field>
          </div>
          {form.prospect_type === "vendor" && (
            <Field label={t("vendorCategoryLabel")}>
              <select
                value={form.vendor_category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vendor_category: e.target.value }))
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">—</option>
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("email")}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </Field>
            <Field label={t("whatsapp")}>
              <Input
                value={form.whatsapp}
                onChange={(e) =>
                  setForm((f) => ({ ...f, whatsapp: e.target.value }))
                }
                placeholder="+201234567890"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Instagram">
              <Input
                value={form.instagram}
                onChange={(e) =>
                  setForm((f) => ({ ...f, instagram: e.target.value }))
                }
                placeholder="@handle"
              />
            </Field>
            <Field label="Facebook">
              <Input
                value={form.facebook}
                onChange={(e) =>
                  setForm((f) => ({ ...f, facebook: e.target.value }))
                }
                placeholder="page slug or URL"
              />
            </Field>
            <Field label="TikTok">
              <Input
                value={form.tiktok}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tiktok: e.target.value }))
                }
                placeholder="@handle"
              />
            </Field>
            <Field label={t("website")}>
              <Input
                type="url"
                value={form.website}
                onChange={(e) =>
                  setForm((f) => ({ ...f, website: e.target.value }))
                }
                placeholder="https://"
              />
            </Field>
          </div>
          <Field label={t("city")}>
            <Input
              value={form.city}
              onChange={(e) =>
                setForm((f) => ({ ...f, city: e.target.value }))
              }
              placeholder="Cairo"
            />
          </Field>
          <Field label={t("bio")}>
            <Textarea
              rows={2}
              value={form.bio}
              onChange={(e) =>
                setForm((f) => ({ ...f, bio: e.target.value }))
              }
            />
          </Field>
          <Field label={t("notes")}>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || !form.display_name.trim()}
              className="bg-brand-gradient text-white"
            >
              {create.isPending ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="me-2 size-4" />
              )}
              {t("addProspect")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-rose-600">*</span>}
      </Label>
      {children}
    </div>
  );
}
