"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ContactFormProps {
  /**
   * Drives the routing on the server (which inbox + which subject prefix)
   * and the labels rendered to the user. Both kinds share the same
   * mutation so we don't have to maintain two round-trips.
   */
  kind: "contact" | "bug_report";
}

/**
 * Public contact / bug-report form. Renders inline (not inside a card)
 * so each surface page can wrap it in whatever framing it likes
 * (LegalPage chrome, dedicated bug-report page, etc.).
 *
 * Submission is anonymous-friendly — visitors aren't required to be
 * signed in. The server applies a sliding-window rate limit and a
 * honeypot, so the form is safe to expose to the open web.
 */
export function ContactForm({ kind }: ContactFormProps) {
  const t = useTranslations(kind === "bug_report" ? "bugReport" : "contactForm");
  const submit = trpc.contact.submit.useMutation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [hp, setHp] = useState("");
  // Auto-collected diagnostics for bug reports — page URL + UA. We
  // capture them client-side so the support inbox always has the
  // context without the user having to type it.
  const [url, setUrl] = useState("");
  const [userAgent, setUserAgent] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUrl(window.location.href);
    setUserAgent(window.navigator.userAgent);
  }, []);

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    message.trim().length >= 10 &&
    !submit.isPending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await submit.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim() || undefined,
        message: message.trim(),
        kind,
        // Only include diagnostics for bug reports — for plain contact
        // they're unnecessary noise in the inbox.
        ...(kind === "bug_report"
          ? { url, userAgent }
          : {}),
        hp: hp || undefined,
      });
      toast.success(t("successToast"));
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : t("errorToast");
      toast.error(msg);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="not-prose mt-8 space-y-5 rounded-2xl border border-brand-line bg-white/80 p-6 backdrop-blur-sm"
      aria-label={t("formAriaLabel")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cf-name">{t("name")}</Label>
          <Input
            id="cf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            disabled={submit.isPending}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-email">{t("email")}</Label>
          <Input
            id="cf-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={submit.isPending}
            maxLength={200}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-subject">{t("subject")}</Label>
        <Input
          id="cf-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("subjectPlaceholder")}
          disabled={submit.isPending}
          maxLength={200}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-message">{t("message")}</Label>
        <Textarea
          id="cf-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("messagePlaceholder")}
          rows={kind === "bug_report" ? 8 : 6}
          required
          minLength={10}
          maxLength={5000}
          disabled={submit.isPending}
          className="resize-y"
        />
        <p className="text-[11px] text-muted-foreground">
          {t("messageHint", { remaining: 5000 - message.length })}
        </p>
      </div>

      {/* Honeypot — kept outside the visible flow with `aria-hidden` and
          `tabIndex=-1` so screen readers + keyboard users don't see it.
          Real bots will happily fill it in. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label htmlFor="cf-hp">Leave this field empty</label>
        <input
          id="cf-hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          className="gap-2 bg-brand-gradient text-white"
        >
          {submit.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4 rtl:-scale-x-100" aria-hidden />
          )}
          {submit.isPending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
