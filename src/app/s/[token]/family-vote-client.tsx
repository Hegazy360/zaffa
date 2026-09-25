"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Heart, Loader2, NotebookPen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { formatCount } from "@/lib/money-format";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { MediaImage } from "@/components/ui/media-image";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/** Where every way off this page leads, tagged so the loop can be measured. */
export const FAMILY_SHARE_HOME = "/?utm_source=family_share";

export interface FamilyShareVersion {
  id: string;
  number: number;
  url: string;
  caption: string | null;
}

export interface FamilySharePayload {
  coupleName: string | null;
  designName: string | null;
  versions: FamilyShareVersion[];
}

// Kept in the visitor's browser, never on a server: who they are (a random
// key and the first name they typed, reused across every link they open) and
// which version they picked on this link.
const VOTER_STORAGE = "zaffa:family-voter";
const choiceStorage = (token: string) => `zaffa:family-vote:${token}`;

interface Voter {
  key: string;
  name: string;
}

interface Choice {
  mediaId: string;
  comment: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: the vote still counts on the server,
    // the page just asks for the name again next time.
  }
}

/** A v4 uuid, also where `crypto.randomUUID` is missing (plain http). */
function newVoterKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * This browser's voter key, saved BEFORE the first vote goes out. A vote the
 * server kept but whose answer never reached the phone (patchy mobile data)
 * is then retried under the same key and updates that row, where a fresh key
 * per attempt would count the same person twice. The name is saved only
 * once a vote goes through, so the dialog still asks for it after a failure.
 */
function ensureVoterKey(): string {
  const stored = readJson<Partial<Voter>>(VOTER_STORAGE);
  if (typeof stored?.key === "string" && UUID.test(stored.key)) return stored.key;
  const key = newVoterKey();
  writeJson(VOTER_STORAGE, { key, name: "" });
  return key;
}

function errorCode(err: unknown): string | undefined {
  return err instanceof TRPCClientError
    ? (err.data?.code as string | undefined)
    : undefined;
}

interface Props {
  token: string;
  /** Read on the server for a live link, so the page paints with its images. */
  initial: FamilySharePayload | null;
  /** The kill switch as the server saw it. */
  enabled: boolean;
}

/**
 * F6, the page a family member opens from WhatsApp.
 *
 * Built for a phone in someone's hand for thirty seconds: big images, one
 * heart per version, a first name the first time and never again, and a
 * way back to the studio at the end. No account, no session: the server
 * never mints one for `/s/`, and the vote is keyed on a random id this
 * browser keeps.
 *
 * A live link arrives already read by the server. When it does not (an
 * unknown or revoked token), the page asks the API once and then shows
 * the "link no longer active" state.
 */
export function FamilyVoteClient({ token, initial, enabled }: Props) {
  const t = useTranslations("familyShare");
  const locale = useLocale();

  const query = trpc.designShares.getByToken.useQuery(
    { token },
    {
      enabled: enabled && !initial,
      retry: false,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    },
  );
  const data = initial ?? query.data ?? null;
  const [gone, setGone] = useState(false);

  // Read after mount: localStorage does not exist during the server render.
  const [voter, setVoter] = useState<Voter | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  useEffect(() => {
    const storedVoter = readJson<Voter>(VOTER_STORAGE);
    const storedChoice = readJson<Choice>(choiceStorage(token));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of browser storage after hydration
    setVoter(storedVoter?.key && storedVoter.name ? storedVoter : null);
    setChoice(storedChoice?.mediaId ? storedChoice : null);
  }, [token]);

  // The dialog asks for a name (first vote) or edits the note on a pick.
  const [dialog, setDialog] = useState<{ mediaId: string } | null>(null);

  const vote = trpc.designShares.vote.useMutation();
  // Held for the life of the page as well as in storage, so a retry reuses
  // the key even where storage refuses writes (private mode, full quota).
  const voterKey = useRef<string | null>(null);

  const castVote = async (
    mediaId: string,
    name: string,
    comment: string,
  ): Promise<string | null> => {
    if (!voterKey.current) voterKey.current = voter?.key ?? ensureVoterKey();
    const key = voterKey.current;
    try {
      await vote.mutateAsync({
        token,
        mediaId,
        voterKey: key,
        voterName: name,
        comment: comment || undefined,
      });
    } catch (err) {
      const code = errorCode(err);
      if (code === "NOT_FOUND" || code === "PRECONDITION_FAILED") {
        setGone(true);
        return null;
      }
      return code === "TOO_MANY_REQUESTS" ? t("voteRateLimited") : t("voteError");
    }
    const nextVoter = { key, name };
    const nextChoice = { mediaId, comment };
    setVoter(nextVoter);
    setChoice(nextChoice);
    writeJson(VOTER_STORAGE, nextVoter);
    writeJson(choiceStorage(token), nextChoice);
    toast.success(t("voteSaved"));
    return null;
  };

  const onHeart = async (mediaId: string) => {
    if (choice?.mediaId === mediaId || vote.isPending) return;
    if (!voter) {
      setDialog({ mediaId });
      return;
    }
    // Changing their mind: the note belonged to the old pick, so it goes.
    const error = await castVote(mediaId, voter.name, "");
    if (error) toast.error(error);
  };

  if (!enabled || gone || query.isError) {
    return <PageFrame><GoneState /></PageFrame>;
  }

  if (!data) {
    return (
      <PageFrame>
        <SkeletonRegion label={t("loading")}>
          <div className="space-y-4 pt-2">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="aspect-video w-full rounded-2xl" />
          </div>
        </SkeletonRegion>
      </PageFrame>
    );
  }

  const name = data.coupleName;
  const chosen = data.versions.find((v) => v.id === choice?.mediaId) ?? null;
  const count = (n: number) => formatCount(n, locale);

  return (
    <PageFrame>
      <div className="space-y-3 pt-2">
        {data.designName ? (
          <p className="text-eyebrow text-rose-700">
            <bdi>{data.designName}</bdi>
          </p>
        ) : null}
        <h1 className="font-display text-3xl leading-tight font-light text-foreground sm:text-4xl">
          {name ? t("pageTitleNamed", { name }) : t("pageTitle")}
        </h1>
        <p className="text-base text-muted-foreground">
          {name ? t("pageIntroNamed", { name }) : t("pageIntro")}
        </p>
      </div>

      {/* Polite live region: a vote reads out, and a returning visitor sees
          their pick before scrolling. The picked card carries the note. */}
      <div role="status" aria-live="polite">
        {chosen ? (
          <p
            data-testid="family-chosen"
            className="mt-5 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-200"
          >
            <Heart aria-hidden className="mt-0.5 size-4 shrink-0 fill-current text-rose-500" />
            <span>{t("chosen", { number: count(chosen.number) })}</span>
          </p>
        ) : null}
      </div>

      <ol className="mt-8 space-y-8" data-testid="family-versions">
        {data.versions.map((version, index) => {
          const picked = choice?.mediaId === version.id;
          const pending = vote.isPending && vote.variables?.mediaId === version.id;
          return (
            <li key={version.id}>
              <figure
                data-testid="family-version"
                data-picked={picked ? "true" : undefined}
                className={cn(
                  "overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.08] shadow-[0_12px_40px_-18px_rgba(244,63,94,0.25)] transition-shadow motion-reduce:transition-none",
                  picked && "ring-2 ring-rose-500",
                )}
              >
                <div className="relative aspect-video bg-muted">
                  <MediaImage
                    src={version.url}
                    alt={t("versionAlt", { number: count(version.number) })}
                    fill
                    sizes="half"
                    priority={index === 0}
                  />
                </div>
                <figcaption className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {t("version", { number: count(version.number) })}
                    </p>
                    {version.caption ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground" dir="auto">
                        {t("changeAsked", { text: version.caption })}
                      </p>
                    ) : null}
                    {picked ? (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setDialog({ mediaId: version.id })}
                        className="-ms-1 h-11 gap-1.5 px-1 text-rose-700"
                      >
                        <NotebookPen aria-hidden className="size-4" />
                        {choice?.comment ? t("editNote") : t("addNote")}
                      </Button>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant={picked ? "default" : "outline"}
                    aria-pressed={picked}
                    disabled={vote.isPending && !pending}
                    onClick={() => void onHeart(version.id)}
                    className={cn(
                      "h-11 shrink-0 gap-2 rounded-full px-4",
                      picked
                        ? "bg-rose-600 text-white hover:bg-rose-600"
                        : "border-rose-200 text-rose-700 hover:bg-rose-50",
                    )}
                  >
                    {pending ? (
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                    ) : (
                      <Heart aria-hidden className={cn("size-4", picked && "fill-current")} />
                    )}
                    {picked ? t("votedBadge") : t("voteCta")}
                  </Button>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ol>

      <VoteDialog
        key={dialog?.mediaId ?? "closed"}
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        coupleName={name}
        initialName={voter?.name ?? ""}
        initialComment={dialog && choice?.mediaId === dialog.mediaId ? choice.comment : ""}
        editing={Boolean(dialog && choice?.mediaId === dialog.mediaId)}
        pending={vote.isPending}
        onSubmit={async (voterName, comment) => {
          if (!dialog) return null;
          const error = await castVote(dialog.mediaId, voterName, comment);
          if (!error) setDialog(null);
          return error;
        }}
      />
    </PageFrame>
  );
}

/** The chrome every state shares: a light header and the way back to the studio. */
function PageFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("familyShare");
  const tBrand = useTranslations("brand");
  return (
    <div className="min-h-dvh bg-gradient-to-b from-rose-50/70 via-background to-background">
      <header className="mx-auto flex max-w-3xl items-center px-4 py-4">
        <Link
          href={FAMILY_SHARE_HOME}
          aria-label={t("homeLink")}
          className="-mx-1 inline-flex min-h-11 items-center gap-2 px-1"
        >
          <span className="font-display text-brand-gradient text-2xl font-light italic tracking-tight">
            {tBrand("name")}
          </span>
          <span className="font-arabic text-sm text-muted-foreground">
            {tBrand("nameArabic")}
          </span>
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-10">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-12">
        <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/[0.06] sm:p-6">
          <p className="font-display text-xl font-light text-foreground">{t("footerTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("footerBody")}</p>
          {/* A real link, not a Button rendering one: base-ui gives a
              rendered non-button the button role, and this navigates. */}
          <Link
            href={FAMILY_SHARE_HOME}
            className={cn(buttonVariants({ variant: "cta", size: "xl" }), "mt-4")}
          >
            <Sparkles aria-hidden className="size-4" />
            {t("footerCta")}
            <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" />
          </Link>
        </div>
      </footer>
    </div>
  );
}

function GoneState() {
  const t = useTranslations("familyShare");
  return (
    <div data-testid="family-gone" className="space-y-2 pt-6 pb-4">
      <h1 className="font-display text-3xl leading-tight font-light text-foreground">
        {t("goneTitle")}
      </h1>
      <p className="text-base text-muted-foreground">{t("goneBody")}</p>
    </div>
  );
}

interface VoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupleName: string | null;
  initialName: string;
  initialComment: string;
  /** Editing the note on the current pick, rather than a first vote. */
  editing: boolean;
  pending: boolean;
  /** Resolves to an error line to show, or null when the vote went through. */
  onSubmit: (name: string, comment: string) => Promise<string | null>;
}

function VoteDialog({
  open,
  onOpenChange,
  coupleName,
  initialName,
  initialComment,
  editing,
  pending,
  onSubmit,
}: VoteDialogProps) {
  const t = useTranslations("familyShare");
  const nameId = useId();
  const nameErrorId = useId();
  const noteId = useId();
  const [name, setName] = useState(initialName);
  const [comment, setComment] = useState(initialComment);
  const [nameMissing, setNameMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMissing(true);
      document.getElementById(nameId)?.focus();
      return;
    }
    setError(await onSubmit(trimmed, comment.trim()));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-md sm:p-6"
      >
        <div className="space-y-2">
          <DialogTitle className="font-display text-2xl leading-tight font-light">
            {editing ? (initialComment ? t("editNote") : t("addNote")) : t("nameTitle")}
          </DialogTitle>
          <DialogDescription>
            {coupleName ? t("nameBodyNamed", { name: coupleName }) : t("nameBody")}
          </DialogDescription>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>{t("nameLabel")}</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameMissing) setNameMissing(false);
              }}
              maxLength={40}
              autoComplete="given-name"
              dir="auto"
              required
              aria-invalid={nameMissing || undefined}
              aria-describedby={nameMissing ? nameErrorId : undefined}
              className="h-11"
            />
            {nameMissing ? (
              <p id={nameErrorId} className="text-xs text-destructive">
                {t("nameRequired")}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={noteId}>{t("noteLabel")}</Label>
            <Textarea
              id={noteId}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={280}
              rows={3}
              dir="auto"
              placeholder={t("notePlaceholder")}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" variant="cta" disabled={pending} className="h-11 gap-2 px-5">
              {pending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Heart aria-hidden className="size-4" />
              )}
              {editing ? t("saveNote") : t("submitVote")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
