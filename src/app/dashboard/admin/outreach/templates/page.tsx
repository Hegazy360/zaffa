"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Edit2,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";
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
import { toast } from "sonner";

const CHANNELS = ["email", "whatsapp", "instagram"] as const;
const TYPES = ["planner", "vendor", "unknown"] as const;
const CATEGORIES = [
  "",
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

type Template = {
  id: string;
  name: string;
  channel: string;
  type: string;
  category: string | null;
  subject: string | null;
  body: string;
  active: boolean;
  updated_at: Date;
};

export default function OutreachTemplatesPage() {
  const t = useTranslations("admin");
  const f = useFormatters();
  const list = trpc.outreach.templatesList.useQuery();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight">
            {t("templatesTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("templatesSubtitle")}
          </p>
        </div>
        <TemplateDialog />
      </header>

      <div className="rounded-2xl border border-brand-line bg-white/80">
        {list.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : (list.data?.length ?? 0) === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {t("templatesEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {list.data!.map((tpl) => (
              <li key={tpl.id} className="flex items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium">{tpl.name}</p>
                    <Badge>{tpl.channel}</Badge>
                    <Badge>{tpl.type}</Badge>
                    {tpl.category && <Badge tone="rose">{tpl.category}</Badge>}
                    {!tpl.active && <Badge tone="stone">{t("inactive")}</Badge>}
                  </div>
                  {tpl.subject && (
                    <p
                      dir="auto"
                      className="mt-1 truncate text-xs text-muted-foreground"
                    >
                      {t("subjectLabel")}: {tpl.subject}
                    </p>
                  )}
                  <pre
                    dir="auto"
                    className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground"
                  >
                    {tpl.body}
                  </pre>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {f.relativeTime(tpl.updated_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <TemplateDialog template={tpl} />
                  <DeleteTemplateButton id={tpl.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Badge({
  children,
  tone = "stone",
}: {
  children: React.ReactNode;
  tone?: "stone" | "rose";
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${
        tone === "rose"
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-stone-100 text-stone-700 ring-stone-200"
      }`}
    >
      {children}
    </span>
  );
}

function TemplateDialog({ template }: { template?: Template }) {
  const t = useTranslations("admin");
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const isEdit = !!template;
  const [form, setForm] = useState({
    name: template?.name ?? "",
    channel: (template?.channel ?? "email") as (typeof CHANNELS)[number],
    type: (template?.type ?? "planner") as (typeof TYPES)[number],
    category: template?.category ?? "",
    subject: template?.subject ?? "",
    body: template?.body ?? "",
    active: template?.active ?? true,
  });

  const upsert = trpc.outreach.templateUpsert.useMutation({
    onSuccess: () => {
      toast.success(isEdit ? t("templateUpdated") : t("templateCreated"));
      utils.outreach.templatesList.invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    type Category = Exclude<(typeof CATEGORIES)[number], "">;
    const category =
      form.category && form.category !== ""
        ? (form.category as Category)
        : null;
    upsert.mutate({
      id: template?.id,
      name: form.name.trim(),
      channel: form.channel,
      type: form.type,
      category,
      subject: form.subject.trim() || null,
      body: form.body.trim(),
      active: form.active,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button size="sm" variant="ghost" />
          ) : (
            <Button className="bg-brand-gradient text-white" />
          )
        }
      >
        {isEdit ? <Edit2 className="size-3.5" /> : <Plus className="size-4" />}
        {isEdit ? null : t("newTemplate")}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editTemplateTitle") : t("newTemplateTitle")}
          </DialogTitle>
          <DialogDescription>{t("templateDialogDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("templateName")}</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("channel")}</Label>
              <select
                value={form.channel}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    channel: e.target.value as (typeof CHANNELS)[number],
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("prospectTypeLabel")}</Label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    type: e.target.value as (typeof TYPES)[number],
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {TYPES.map((c) => (
                  <option key={c} value={c}>
                    {t(`prospectType.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("vendorCategoryLabel")}</Label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((s) => ({ ...s, category: e.target.value }))
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c || "—"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.channel === "email" && (
            <div className="space-y-1.5">
              <Label>{t("subjectLabel")}</Label>
              <Input
                dir="auto"
                value={form.subject}
                onChange={(e) =>
                  setForm((s) => ({ ...s, subject: e.target.value }))
                }
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("bodyLabel")}</Label>
            <Textarea
              dir="auto"
              required
              rows={8}
              value={form.body}
              onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))}
              placeholder={t("bodyPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">
              {t("bodyHint")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-rose-600"
              checked={form.active}
              onChange={(e) =>
                setForm((s) => ({ ...s, active: e.target.checked }))
              }
            />
            {t("activeTemplate")}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={upsert.isPending}
              className="bg-brand-gradient text-white"
            >
              {upsert.isPending ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="me-2 size-4" />
              )}
              {isEdit ? t("save") : t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTemplateButton({ id }: { id: string }) {
  const t = useTranslations("admin");
  const utils = trpc.useUtils();
  const remove = trpc.outreach.templateDelete.useMutation({
    onSuccess: () => {
      toast.success(t("templateDeleted"));
      utils.outreach.templatesList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        if (confirm(t("confirmDeleteTemplate"))) remove.mutate({ id });
      }}
      disabled={remove.isPending}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
