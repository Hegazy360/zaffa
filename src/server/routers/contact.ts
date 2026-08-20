import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { resend } from "@/lib/resend";
import { enforceTrpcMany } from "@/lib/rate-limit";
import { logger, reportError } from "@/lib/logger";
import { captureServer } from "@/lib/posthog";

// `kind` distinguishes the two surfaces we render the form on. Both go
// to the same inbox but get a different subject prefix + analytics
// property so support can sort them at a glance.
const KIND = z.enum(["contact", "bug_report"]);
type Kind = z.infer<typeof KIND>;

// Pulled from env so a dedicated `bugs@` mailbox can be wired up later
// without code changes. Falls back to the support mailbox.
function inboxFor(kind: Kind): string {
  const fallback = process.env.CONTACT_INBOX_EMAIL ?? "hello@zaffa.ai";
  if (kind === "bug_report") {
    return process.env.BUG_REPORT_INBOX_EMAIL ?? fallback;
  }
  return fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const contactRouter = router({
  /**
   * Public submit endpoint for the contact + bug-report forms. Anonymous
   * visitors are allowed, we rate-limit by IP (and by user id when
   * signed in) to slow abuse without forcing auth on visitors who just
   * want to email us.
   *
   * The honeypot field (`hp`) is invisible in the rendered form. Real
   * humans never type into it; bots that auto-fill every input do. When
   * we see a non-empty value we silently 200 so the bot thinks it
   * succeeded and stops retrying.
   */
  submit: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200),
        subject: z.string().trim().max(200).optional(),
        message: z.string().trim().min(10).max(5000),
        kind: KIND.default("contact"),
        // Optional client-collected diagnostics, only used for the bug
        // report flow but accepted on either kind so the form stays
        // single-shape on the wire.
        url: z.string().trim().max(2000).optional(),
        userAgent: z.string().trim().max(500).optional(),
        // Honeypot, must be empty.
        hp: z.string().max(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Bot caught by honeypot - pretend success, log it so we can
      // tune the form if a real user ever trips it.
      if (input.hp && input.hp.length > 0) {
        logger.info("contact.honeypot.tripped", {
          ip: ctx.user?.id ?? "anon",
          kind: input.kind,
        });
        return { ok: true, queued: false };
      }

      // Rate-limit by user id when signed in, otherwise by email - IP
      // would be ideal but the tRPC context doesn't carry it; email is
      // a reasonable fallback for a public form.
      const identifier = ctx.user?.id ?? input.email.toLowerCase();
      await enforceTrpcMany(
        [
          {
            key: "contactForm",
            message:
              "You've sent a few messages already. Please wait a few minutes and try again.",
          },
          {
            key: "contactFormDaily",
            message:
              "Daily message limit reached. Email us at hello@zaffa.ai if it's urgent.",
          },
        ],
        identifier,
      );

      const inbox = inboxFor(input.kind);
      const subjectPrefix =
        input.kind === "bug_report" ? "[Bug report]" : "[Contact]";
      const subject = `${subjectPrefix} ${input.subject?.trim() || "(no subject)"}, ${input.name}`;

      const safeName = escapeHtml(input.name);
      const safeEmail = escapeHtml(input.email);
      const safeSubject = escapeHtml(input.subject ?? "");
      const safeMessage = escapeHtml(input.message);
      const safeUrl = input.url ? escapeHtml(input.url) : null;
      const safeUserAgent = input.userAgent
        ? escapeHtml(input.userAgent)
        : null;
      const signedInAs = ctx.user?.email
        ? escapeHtml(ctx.user.email)
        : "anonymous visitor";

      // Plain HTML - no chrome, no design tokens. This goes to a human
      // operator, not a customer; readability + grep-ability beats
      // brand polish here.
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1f1a17;">
          <h2 style="margin: 0 0 16px; font-size: 18px;">${escapeHtml(subjectPrefix)} from ${safeName}</h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 16px;">
            <tr><td style="padding: 4px 8px; color: #857a74; width: 120px;">From</td><td style="padding: 4px 8px;">${safeName} &lt;${safeEmail}&gt;</td></tr>
            <tr><td style="padding: 4px 8px; color: #857a74;">Subject</td><td style="padding: 4px 8px;">${safeSubject || "<em>(none)</em>"}</td></tr>
            <tr><td style="padding: 4px 8px; color: #857a74;">Account</td><td style="padding: 4px 8px;">${signedInAs}</td></tr>
            ${safeUrl ? `<tr><td style="padding: 4px 8px; color: #857a74;">Page</td><td style="padding: 4px 8px;"><a href="${safeUrl}">${safeUrl}</a></td></tr>` : ""}
            ${safeUserAgent ? `<tr><td style="padding: 4px 8px; color: #857a74;">UA</td><td style="padding: 4px 8px; font-family: ui-monospace, monospace; font-size: 12px;">${safeUserAgent}</td></tr>` : ""}
          </table>
          <pre style="white-space: pre-wrap; word-break: break-word; background: #fff7f0; border: 1px solid #f7e4d7; border-radius: 8px; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6;">${safeMessage}</pre>
        </div>
      `;

      const text = [
        `${subjectPrefix} from ${input.name} <${input.email}>`,
        ``,
        input.subject ? `Subject: ${input.subject}` : null,
        `Account: ${ctx.user?.email ?? "anonymous"}`,
        input.url ? `Page: ${input.url}` : null,
        input.userAgent ? `UA: ${input.userAgent}` : null,
        ``,
        input.message,
      ]
        .filter(Boolean)
        .join("\n");

      // No Resend key configured (local dev), short-circuit with a log
      // so callers can still test the UI happy path. Production is
      // expected to have RESEND_API_KEY set.
      if (!process.env.RESEND_API_KEY) {
        logger.info("contact.email.skipped_no_key", {
          kind: input.kind,
          inbox,
          from: input.email,
        });
        return { ok: true, queued: false };
      }

      try {
        await resend.emails.send({
          from:
            process.env.NOTIFICATION_FROM_EMAIL ?? "Zaffa <noreply@zaffa.ai>",
          to: inbox,
          // Set Reply-To to the submitter so hitting "Reply" in Gmail
          // goes back to the user, not to our no-reply mailbox.
          replyTo: input.email,
          subject,
          html,
          text,
        });
      } catch (err) {
        // We do NOT want to silently swallow this. The form should
        // surface a generic failure so the user can email us directly,
        // and we want the error in our logs.
        reportError("contact.email.failed", err, {
          kind: input.kind,
          inbox,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "We couldn't send your message. Please email hello@zaffa.ai directly.",
        });
      }

      // Funnel signal, useful for spotting spikes in bug reports vs
      // general contact (e.g. after a deploy). distinctId falls back to
      // the email when anonymous; PostHog tolerates that. Bypassing the
      // typed `trackServer` because contact-form submissions aren't
      // part of the core-journey enum.
      await captureServer(
        ctx.user?.id ?? input.email.toLowerCase(),
        "contact.submitted",
        { kind: input.kind, signed_in: Boolean(ctx.user) },
      );

      return { ok: true, queued: true };
    }),
});
