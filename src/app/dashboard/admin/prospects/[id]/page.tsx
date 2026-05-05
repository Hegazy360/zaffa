"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  Loader2,
  Mail,
  MapPin,
  Music2,
  Phone,
  Save,
  Sparkles,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";
import {
  prospectDisplayName,
  prospectInitial,
} from "@/lib/prospect-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QuickSendWhatsapp } from "@/components/features/prospects/quick-send-whatsapp";
import { toast } from "sonner";

type Channel = "email" | "whatsapp" | "instagram";

const STATUSES = [
  "new",
  "qualified",
  "drafted",
  "contacted",
  "replied",
  "signed_up",
  "rejected",
] as const;

export default function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("admin");
  const f = useFormatters();
  const utils = trpc.useUtils();
  const detail = trpc.prospects.byId.useQuery({ id });
  const [notes, setNotes] = useState<string | null>(null);

  const updateStatus = trpc.prospects.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(t("statusUpdated"));
      utils.prospects.byId.invalidate({ id });
      utils.prospects.list.invalidate();
      utils.prospects.funnel.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setNotesM = trpc.prospects.setNotes.useMutation({
    onSuccess: () => {
      toast.success(t("notesSaved"));
      utils.prospects.byId.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.prospects.delete.useMutation({
    onSuccess: () => {
      toast.success(t("prospectDeleted"));
      utils.prospects.list.invalidate();
      utils.prospects.funnel.invalidate();
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
        <p className="text-sm text-muted-foreground">{t("prospectNotFound")}</p>
      </div>
    );
  }

  const p = detail.data;
  const currentNotes = notes ?? p.notes ?? "";
  const samples = Array.isArray(p.sample_images)
    ? (p.sample_images as string[])
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/dashboard/admin/prospects"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 hover:underline"
        >
          <ArrowLeft className="size-3 rtl:-scale-x-100" />
          {t("backToProspects")}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="text-rose-700"
          onClick={() => {
            if (confirm(t("confirmDeleteProspect"))) {
              remove.mutate({ id });
              window.location.href = "/dashboard/admin/prospects";
            }
          }}
        >
          <Trash2 className="size-3.5" />
          {t("delete")}
        </Button>
      </div>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="size-16">
          {p.avatar_url && <AvatarImage src={p.avatar_url} />}
          <AvatarFallback className="text-lg">
            {prospectInitial(p)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-light tracking-tight">
              {prospectDisplayName(p)}
            </h1>
            {p.qualifying_score != null && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs ring-1 ring-amber-200">
                <Star className="size-3 fill-amber-500 text-amber-500" />
                <span className="font-mono tabular-nums">
                  {p.qualifying_score}/100
                </span>
              </span>
            )}
            {p.signed_up_user_id && (
              <Link
                href={`/dashboard/admin/users/${p.signed_up_user_id}`}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200 hover:underline"
              >
                <UserRound className="size-3" />
                {t("signedUpUser")}
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`prospectType.${p.prospect_type}`)}
            {p.vendor_category && ` · ${p.vendor_category}`}
            {p.handle && ` · @${p.handle}`}
            {p.city && (
              <>
                {" · "}
                <MapPin className="inline size-3" /> {p.city}
              </>
            )}
            {p.followers != null &&
              ` · ${f.number(p.followers)} ${t("followers")}`}
          </p>
        </div>
      </header>

      {/* Status pipeline */}
      <section className="rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
          {t("statusPipeline")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateStatus.mutate({ id, status: s })}
              disabled={updateStatus.isPending || p.status === s}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                p.status === s
                  ? "border-rose-300 bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-sm"
                  : "border-rose-100/70 bg-white/70 text-muted-foreground hover:bg-white"
              }`}
            >
              {t(`prospectStatus.${s}`)}
            </button>
          ))}
        </div>
        {p.contacted_at && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("contactedAtVia", {
              when: f.relativeTime(p.contacted_at),
              via: p.contacted_via ?? "—",
            })}
          </p>
        )}
      </section>

      {/* Contact card */}
      <section className="rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
          {t("contact")}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          <ContactRow
            icon={<Mail className="size-3.5" />}
            label={t("email")}
            value={p.email}
            href={p.email ? `mailto:${p.email}` : null}
          />
          <ContactRow
            icon={<Phone className="size-3.5" />}
            label={t("whatsapp")}
            value={p.whatsapp}
            href={
              p.whatsapp
                ? `https://wa.me/${p.whatsapp.replace(/[^0-9]/g, "")}`
                : null
            }
          />
          <ContactRow
            icon={<Instagram className="size-3.5" />}
            label="Instagram"
            value={p.instagram ? `@${p.instagram.replace(/^@/, "")}` : null}
            href={
              p.instagram
                ? `https://instagram.com/${p.instagram.replace(/^@/, "")}`
                : null
            }
          />
          <ContactRow
            icon={<Facebook className="size-3.5" />}
            label="Facebook"
            value={p.facebook}
            href={
              p.facebook
                ? p.facebook.startsWith("http")
                  ? p.facebook
                  : `https://facebook.com/${p.facebook}`
                : null
            }
          />
          <ContactRow
            icon={<Music2 className="size-3.5" />}
            label="TikTok"
            value={p.tiktok ? `@${p.tiktok.replace(/^@/, "")}` : null}
            href={
              p.tiktok
                ? `https://tiktok.com/@${p.tiktok.replace(/^@/, "")}`
                : null
            }
          />
          <ContactRow
            icon={<Globe className="size-3.5" />}
            label={t("website")}
            value={p.website}
            href={p.website}
          />
          {p.source_url && (
            <ContactRow
              icon={<ExternalLink className="size-3.5" />}
              label={t("sourceUrl")}
              value={p.source_url}
              href={p.source_url}
            />
          )}
        </ul>
      </section>

      {/* Bio */}
      {p.bio && (
        <section className="rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            {t("bio")}
          </p>
          <p
            dir="auto"
            className="whitespace-pre-wrap text-sm text-muted-foreground"
          >
            {p.bio}
          </p>
        </section>
      )}

      {/* Sample images */}
      {samples.length > 0 && (
        <section className="rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            {t("samples")}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {samples.slice(0, 8).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {/* Drafts */}
      <DraftsPanel
        prospectId={p.id}
        existing={{
          email: p.draft_email,
          whatsapp: p.draft_whatsapp,
          instagram: p.draft_instagram,
        }}
        contact={{
          email: p.email,
          whatsapp: p.whatsapp,
          instagram: p.instagram,
        }}
      />

      {/* Notes */}
      <section className="rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
          {t("notes")}
        </p>
        <Textarea
          dir="auto"
          rows={3}
          value={currentNotes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("notesPlaceholder")}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={
              setNotesM.isPending || (notes == null) || notes === (p.notes ?? "")
            }
            onClick={() =>
              setNotesM.mutate({ id, notes: notes ?? "" })
            }
          >
            <Save className="me-1 size-3.5" />
            {t("saveNotes")}
          </Button>
        </div>
      </section>

      {/* Raw payload */}
      {p.raw_payload != null && (
        <details className="rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4 text-sm">
          <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            {t("rawPayload")}
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-stone-50 p-3 text-[11px] text-stone-700 ring-1 ring-stone-200">
            {JSON.stringify(p.raw_payload, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function DraftsPanel({
  prospectId,
  existing,
  contact,
}: {
  prospectId: string;
  existing: { email: string | null; whatsapp: string | null; instagram: string | null };
  contact: { email: string | null; whatsapp: string | null; instagram: string | null };
}) {
  const t = useTranslations("admin");
  const utils = trpc.useUtils();
  const [activeChannel, setActiveChannel] = useState<Channel>("email");

  const draft = trpc.outreach.draft.useMutation({
    onSuccess: () => {
      toast.success(t("draftReady"));
      utils.prospects.byId.invalidate({ id: prospectId });
    },
    onError: (e) => toast.error(e.message),
  });
  const markContacted = trpc.outreach.markContacted.useMutation({
    onSuccess: () => {
      toast.success(t("markedContacted"));
      utils.prospects.byId.invalidate({ id: prospectId });
      utils.prospects.list.invalidate();
      utils.prospects.funnel.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const text =
    activeChannel === "email"
      ? existing.email
      : activeChannel === "whatsapp"
        ? existing.whatsapp
        : existing.instagram;

  const deepLink = (() => {
    if (activeChannel === "email" && contact.email) {
      // Strip a leading "Subject: …\n\n" out of the cached text and surface
      // it via mailto's `subject=` param so the email client picks it up.
      let subject: string | null = null;
      let body = text ?? "";
      const m = body.match(/^Subject:\s*(.*?)\n\n/);
      if (m) {
        subject = m[1];
        body = body.slice(m[0].length);
      }
      const params = new URLSearchParams();
      if (subject) params.set("subject", subject);
      if (body) params.set("body", body);
      return `mailto:${contact.email}?${params.toString()}`;
    }
    if (activeChannel === "whatsapp" && contact.whatsapp) {
      const phone = contact.whatsapp.replace(/[^0-9]/g, "");
      const params = new URLSearchParams();
      if (text) params.set("text", text);
      return `https://wa.me/${phone}?${params.toString()}`;
    }
    if (activeChannel === "instagram" && contact.instagram) {
      return `https://instagram.com/${contact.instagram.replace(/^@/, "")}`;
    }
    return null;
  })();

  return (
    <section className="rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
          {t("draftsTitle")}
        </p>
        <div className="flex gap-1">
          {(["email", "whatsapp", "instagram"] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setActiveChannel(ch)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                activeChannel === ch
                  ? "border-rose-300 bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-sm"
                  : "border-rose-100/70 bg-white/70 text-muted-foreground hover:bg-white"
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      {text ? (
        <pre
          dir="auto"
          className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs text-stone-700 ring-1 ring-stone-200"
        >
          {text}
        </pre>
      ) : (
        <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500 ring-1 ring-stone-200">
          {t("noDraftYet")}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {activeChannel === "whatsapp" && contact.whatsapp && (
          <QuickSendWhatsapp
            prospectId={prospectId}
            whatsapp={contact.whatsapp}
            draft={existing.whatsapp}
          />
        )}
        <Button
          size="sm"
          onClick={() =>
            draft.mutate({ prospectId, channel: activeChannel })
          }
          disabled={draft.isPending}
          className="bg-gradient-to-r from-rose-600 to-amber-500 text-white"
        >
          {draft.isPending ? (
            <Loader2 className="me-1 size-3.5 animate-spin" />
          ) : (
            <Sparkles className="me-1 size-3.5" />
          )}
          {text ? t("regenerateDraft") : t("generateDraft")}
        </Button>
        {text && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              toast.success(t("copied"));
            }}
          >
            <Copy className="me-1 size-3.5" />
            {t("copy")}
          </Button>
        )}
        {deepLink && (
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent"
          >
            <ExternalLink className="size-3" />
            {t("openIn", { channel: activeChannel })}
          </a>
        )}
        {text && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              markContacted.mutate({ prospectId, channel: activeChannel })
            }
            disabled={markContacted.isPending}
          >
            <CheckCircle2 className="me-1 size-3.5" />
            {t("markContacted")}
          </Button>
        )}
      </div>
    </section>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  href: string | null | undefined;
}) {
  if (!value) return null;
  const inner = (
    <>
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm">{value}</p>
      </div>
    </>
  );
  if (href) {
    return (
      <li>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-rose-50/60"
        >
          {inner}
        </a>
      </li>
    );
  }
  return <li className="flex items-center gap-3 px-2 py-1.5">{inner}</li>;
}
