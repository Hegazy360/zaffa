import { Prisma, type NotificationType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/logger";
import { sendNotificationEmail } from "./email";
import { getCopy, type CopyVars, type Locale } from "./copy";

export interface NotifyArgs {
  /** Profile.id of the recipient. */
  userId: string;
  type: NotificationType;
  /** Relative dashboard path to deep-link the user to (e.g. `/dashboard/...`). */
  link?: string;
  /**
   * Template placeholders for title + body. See copy.ts.
   *
   * Pass an object for locale-independent vars, or a function for
   * vars that need to be localized (e.g. a pack name resolved from
   * a SKU into the recipient's preferred locale). Mirrors the
   * `varsFor` pattern on `notifyMany`.
   */
  vars: CopyVars | ((locale: Locale) => CopyVars);
  /** Arbitrary structured metadata persisted with the row. */
  data?: Prisma.InputJsonValue;
  /**
   * Skip the email side-effect even when the user is subscribed. Defaults
   * to false. In-app row is always written so the bell still updates.
   */
  skipEmail?: boolean;
}

/**
 * The single entrypoint for producing a notification. Writes the DB row
 * (source of truth for the in-app bell) and kicks off an email in the
 * background when eligible. Never throws — failures are logged and
 * swallowed so a notification bug can't break the parent mutation.
 *
 * Usage is meant to be one-liners inside tRPC mutations:
 *
 *   await notify({
 *     userId: event.client_id,
 *     type: "proposal_received",
 *     link: `/dashboard/client/event/${event.id}/proposals`,
 *     vars: { plannerName, eventTitle: event.title },
 *   });
 */
export async function notify(args: NotifyArgs): Promise<void> {
  try {
    const recipient = await prisma.profile.findUnique({
      where: { id: args.userId },
      select: {
        id: true,
        locale: true,
        email_unsubscribed_at: true,
      },
    });
    if (!recipient) return;

    const locale: Locale = recipient.locale === "ar" ? "ar" : "en";
    const resolvedVars =
      typeof args.vars === "function" ? args.vars(locale) : args.vars;
    const copy = getCopy(args.type, locale, resolvedVars);

    const notification = await prisma.notification.create({
      data: {
        user_id: recipient.id,
        type: args.type,
        title: copy.title,
        body: copy.body,
        link: args.link ?? null,
        data: args.data ?? {},
      },
    });

    if (args.skipEmail || recipient.email_unsubscribed_at) return;

    // Resolve the recipient's email from Supabase auth. Profile table doesn't
    // store the email (auth.users does) — we select via a raw query so Prisma
    // doesn't need to know about the auth schema.
    const email = await resolveUserEmail(recipient.id);
    if (!email) return;

    // Fire-and-forget. We mark emailed_at on success so an ops audit can
    // distinguish "sent" from "in-app only" notifications.
    void sendNotificationEmail({
      to: email,
      locale,
      copy,
      ctaHref: args.link ?? "/dashboard",
      userId: recipient.id,
    }).then((ok) => {
      if (!ok) return;
      void prisma.notification
        .update({
          where: { id: notification.id },
          data: { emailed_at: new Date() },
        })
        .catch(() => {});
    });
  } catch (err) {
    reportError("notifications.notify.failed", err, {
      userId: args.userId,
      type: args.type,
    });
  }
}

export interface BulkNotifyArgs {
  userIds: string[];
  type: NotificationType;
  link?: string;
  /**
   * Called with each recipient's locale so the title/body can be formatted
   * with per-user placeholders (most notifications use the same copy for
   * everyone, but `event_in_service_area` interpolates the matched city).
   */
  varsFor: (userId: string, locale: Locale) => CopyVars;
  data?: Prisma.InputJsonValue;
}

/**
 * Fan-out variant for notifications that target many users at once (e.g.
 * "new event in your service area"). Persists rows in a single
 * `createMany` transaction, then fires emails in parallel with
 * `Promise.allSettled` so a handful of send failures don't abort the rest.
 */
export async function notifyMany(args: BulkNotifyArgs): Promise<void> {
  if (args.userIds.length === 0) return;
  try {
    const recipients = await prisma.profile.findMany({
      where: { id: { in: args.userIds } },
      select: { id: true, locale: true, email_unsubscribed_at: true },
    });
    if (recipients.length === 0) return;

    const rows = recipients.map((r) => {
      const locale: Locale = r.locale === "ar" ? "ar" : "en";
      const vars = args.varsFor(r.id, locale);
      const copy = getCopy(args.type, locale, vars);
      return {
        recipient: r,
        locale,
        copy,
        row: {
          user_id: r.id,
          type: args.type,
          title: copy.title,
          body: copy.body,
          link: args.link ?? null,
          data: args.data ?? {},
        } satisfies Prisma.NotificationCreateManyInput,
      };
    });

    await prisma.notification.createMany({ data: rows.map((r) => r.row) });

    // Kick off emails in parallel for subscribed recipients.
    const mailable = rows.filter((r) => !r.recipient.email_unsubscribed_at);
    if (mailable.length === 0) return;

    const emails = await resolveUserEmails(mailable.map((m) => m.recipient.id));
    await Promise.allSettled(
      mailable.map((m) => {
        const email = emails.get(m.recipient.id);
        if (!email) return Promise.resolve();
        return sendNotificationEmail({
          to: email,
          locale: m.locale,
          copy: m.copy,
          ctaHref: args.link ?? "/dashboard",
          userId: m.recipient.id,
        });
      }),
    );
  } catch (err) {
    reportError("notifications.notifyMany.failed", err, {
      type: args.type,
      count: args.userIds.length,
    });
  }
}

/**
 * Returns the auth.users email for a given profile id, or null if absent.
 * Safe to call from tRPC procedures that use the service-role connection
 * behind Prisma (the default). Uses $queryRaw so we don't have to model
 * the auth schema in Prisma.
 */
async function resolveUserEmail(userId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ email: string | null }>>(
      Prisma.sql`select email from auth.users where id = ${userId}::uuid limit 1`,
    );
    return rows[0]?.email ?? null;
  } catch (err) {
    reportError("notifications.resolveUserEmail.failed", err, { userId });
    return null;
  }
}

async function resolveUserEmails(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; email: string | null }>>(
      Prisma.sql`select id::text as id, email from auth.users where id = any(${userIds}::uuid[])`,
    );
    for (const r of rows) {
      if (r.email) map.set(r.id, r.email);
    }
  } catch (err) {
    reportError("notifications.resolveUserEmails.failed", err, {
      count: userIds.length,
    });
  }
  return map;
}
