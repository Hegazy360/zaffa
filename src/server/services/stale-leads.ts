import "server-only";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/logger";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { sendNotificationEmail } from "@/server/services/notifications/email";
import { resolveUserEmails } from "@/server/services/notifications/notify";
import type {
  Locale,
  NotificationCopy,
  NotificationFact,
} from "@/server/services/notifications/copy";

/**
 * The stale-lead nag (F5, "Leads that never rot").
 *
 * The first real approval sat at `new` for 16 days and nothing anywhere
 * noticed: the admin fan-out fires once, when the lead arrives, and the
 * inbox only says "x ago". We promise a reply within a day
 * (`REPLY_WITHIN_HOURS`), so once a day the cron sends every admin ONE
 * digest of the enquiries still `new` after 12 hours, newest first (the
 * most salvageable on top), each row linking to its enquiry.
 *
 * Email only, deliberately: an in-app row would need a new notification
 * type (a schema change), and the bell is exactly what was being missed.
 * A lead stays in the digest every day until someone moves it along, which
 * is the point.
 */

/** A lead is stale once it has sat at `new` this long. */
export const STALE_AFTER_HOURS = 12;

/** Rows listed in one email; the headline still counts them all. */
export const DIGEST_MAX_ROWS = 20;

/** Stable distinct id for events the system raises about our own lag. */
const OPS_DISTINCT_ID = "zaffa-ops";

const SOURCE_LABEL: Record<string, Record<Locale, string>> = {
  design_approved: { en: "Approved design", ar: "تصميم معتمد" },
  whole_wedding_home: { en: "Enquiry form", ar: "نموذج الطلب" },
  render_page: { en: "From a render", ar: "من تصميم" },
  contact: { en: "Contact page", ar: "صفحة التواصل" },
  admin: { en: "Added by admin", ar: "أضافه المشرف" },
};

export interface StaleLead {
  id: string;
  full_name: string;
  source: string;
  created_at: Date;
}

function waitedFor(createdAt: Date, now: Date, locale: Locale): string {
  const hours = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 3_600_000));
  // Latin digits in Arabic too, like every number the team reads.
  const fmt = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en", {
    numeric: "always",
  });
  return hours < 48 ? fmt.format(-hours, "hour") : fmt.format(-Math.floor(hours / 24), "day");
}

/** The digest, in the admin's language. Pure, so it can be tested as is. */
export function staleLeadDigestCopy(
  leads: readonly StaleLead[],
  total: number,
  now: Date,
  locale: Locale,
): NotificationCopy {
  const ar = locale === "ar";
  const facts: NotificationFact[] = leads.map((lead) => ({
    label: lead.full_name,
    value: `${SOURCE_LABEL[lead.source]?.[locale] ?? lead.source} · ${waitedFor(lead.created_at, now, locale)}`,
    href: `/dashboard/admin/enquiries/${lead.id}`,
  }));
  const more = total - leads.length;
  return ar
    ? {
        eyebrow: "طلبات بانتظار الرد",
        title:
          // "N طلبات" is only right from 3 to 10, so the count goes after
          // a colon, where no agreement is needed.
          total === 1 ? "طلب واحد ما زال بانتظار الرد" : `طلبات بانتظار الرد: ${total}`,
        body:
          `هذه الطلبات ما زالت «جديدة» بعد أكثر من ${STALE_AFTER_HOURS} ساعة، ووعدنا الأزواج بالرد خلال يوم. تواصلوا معهم أو انقلوا الطلب إلى مرحلته التالية.` +
          (more > 0 ? ` تظهر هنا الأحدث منها (${leads.length})، والباقي في صندوق الطلبات.` : ""),
        ctaLabel: "افتح صندوق الطلبات",
        facts,
      }
    : {
        eyebrow: "Waiting for a reply",
        title:
          total === 1
            ? "1 lead is still waiting for a reply"
            : `${total} leads are still waiting for a reply`,
        body:
          `These enquiries are still New after more than ${STALE_AFTER_HOURS} hours, and we promise couples a reply within a day. Reach out, or move them along.` +
          (more > 0 ? ` The newest ${leads.length} are listed; the rest are in the inbox.` : ""),
        ctaLabel: "Open the inbox",
        facts,
      };
}

/**
 * Send the digest. Returns how many leads were stale and how many admins
 * were emailed. Throws only if the database read fails; the cron wraps it
 * in its own try/catch so the payment reminders never depend on it.
 */
export async function sendStaleLeadDigest(
  now: Date = new Date(),
): Promise<{ stale: number; emailed: number }> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000);
  const where = { status: "new" as const, created_at: { lt: cutoff } };
  const [total, leads] = await Promise.all([
    prisma.enquiry.count({ where }),
    prisma.enquiry.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: DIGEST_MAX_ROWS,
      select: { id: true, full_name: true, source: true, created_at: true },
    }),
  ]);
  if (total === 0 || leads.length === 0) return { stale: 0, emailed: 0 };

  const admins = await prisma.profile.findMany({
    where: { role: "admin", email_unsubscribed_at: null },
    select: { id: true, locale: true },
  });
  if (admins.length === 0) return { stale: total, emailed: 0 };

  const emails = await resolveUserEmails(admins.map((a) => a.id));
  let emailed = 0;
  for (const admin of admins) {
    const to = emails.get(admin.id);
    if (!to) continue;
    const locale: Locale = admin.locale === "ar" ? "ar" : "en";
    const ok = await sendNotificationEmail({
      to,
      locale,
      copy: staleLeadDigestCopy(leads, total, now, locale),
      ctaHref: "/dashboard/admin/enquiries",
      userId: admin.id,
    });
    if (ok) emailed += 1;
    else {
      reportError("stale_leads.email_failed", new Error("digest not sent"), {
        adminId: admin.id,
        stale: total,
      });
    }
  }

  // One event per lead actually put in front of someone, so "how long do
  // leads sit" and "how often did we have to nag" read off the same data.
  if (emailed > 0) {
    await Promise.all(
      leads.map((lead) =>
        trackServer(OPS_DISTINCT_ID, ANALYTICS_EVENTS.ENQUIRY_STALE_NAGGED, {
          enquiry_id: lead.id,
          source: lead.source,
          age_hours: Math.floor((now.getTime() - lead.created_at.getTime()) / 3_600_000),
        }),
      ),
    );
  }
  return { stale: total, emailed };
}
