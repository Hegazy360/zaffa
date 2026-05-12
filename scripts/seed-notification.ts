/**
 * Dev-only script to seed notifications for a specific user so you can
 * visually verify the bell, inbox, realtime subscription, and email
 * renderer without triggering a full app flow (proposal -> accept ->
 * payment, etc.).
 *
 * Usage:
 *   npm run dev:seed-notification -- --email you@example.com
 *   npm run dev:seed-notification -- --user-id <uuid>
 *   npm run dev:seed-notification -- --email you@example.com --type proposal_received
 *   npm run dev:seed-notification -- --email you@example.com --count 5
 *   npm run dev:seed-notification -- --email you@example.com --email-send
 *   npm run dev:seed-notification -- --email you@example.com --email-send --deliver-to test@mail-tester.com
 *
 * Flags:
 *   --email <addr>       The user's Supabase Auth email. We resolve it to
 *                        the matching profile via the Supabase admin API.
 *   --user-id <uuid>     Alternative to --email. Skips the lookup entirely.
 *   --type <type>        Optional. A single NotificationType. If omitted,
 *                        cycles through a demo set covering every role.
 *   --count <n>          Optional. Number of rows per template (default 1).
 *                        Handy for pagination + infinite-scroll testing.
 *   --email-send         Optional. Also trigger the Resend email path. Off
 *                        by default so re-running doesn't spam mailboxes.
 *   --deliver-to <addr>  Optional. Override the Resend `to:` address so
 *                        the email goes somewhere OTHER than the resolved
 *                        user's own inbox. The DB row and unsubscribe
 *                        token still belong to the resolved user. Handy
 *                        for mail-tester.com, Litmus, or previewing in a
 *                        different mailbox without creating a new account.
 */

import {
  PrismaClient,
  type NotificationType,
  type Prisma,
} from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_DATABASE_URL or DATABASE_URL must be set");
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// A representative demo set. Covers the three roles + the shared
// `message_received` type. Intentionally short — run with --type to
// exercise every enum value individually.
//
// Each entry carries realistic `vars` so the rendered copy (title,
// body, and the new statement-style facts strip) looks like production
// output rather than empty placeholders.
type SeedVars = Record<string, string | number>;
const DEMO_SEQUENCE: Array<{
  type: NotificationType;
  link: string;
  vars: SeedVars;
}> = [
  {
    type: "proposal_received",
    link: "/dashboard/client",
    vars: {
      plannerName: "Atelier Rose",
      eventTitle: "Layla & Adam's Summer Rooftop",
    },
  },
  {
    type: "payment_due_reminder",
    link: "/dashboard/client",
    vars: {
      eventTitle: "Layla & Adam's Summer Rooftop",
      amount: "EGP 25,000",
      dueDate: "Aug 20, 2026",
    },
  },
  {
    type: "message_received",
    link: "/dashboard/client/messages",
    vars: {
      senderName: "Nour, your planner",
      preview:
        "\u201cHey! Quick question about the floral palette — would you be open to a softer blush instead of coral?\u201d",
    },
  },
  {
    type: "event_in_service_area",
    link: "/dashboard/planner/marketplace",
    vars: {
      eventType: "wedding",
      eventTitle: "Golden hour engagement",
      city: "Cairo",
    },
  },
  {
    type: "engagement_requested",
    link: "/dashboard/vendor/engagements",
    vars: {
      plannerName: "Nada Hassan",
      engagementTitle: "Full-service floral (ceremony + reception)",
      totalAmount: "EGP 48,500",
      eventTitle: "Mariam & Youssef — Sep 14",
    },
  },
];

/**
 * Realistic `vars` for every NotificationType, so --type runs exercise
 * the same copy paths that production uses. Kept separate from the
 * DEMO_SEQUENCE (which defines link + ordering) so individual-type
 * runs don't depend on that list.
 */
const DEMO_VARS: Record<NotificationType, SeedVars> = {
  // Client
  proposal_received: {
    plannerName: "Atelier Rose",
    eventTitle: "Layla & Adam's Summer Rooftop",
  },
  proposal_withdrawn: {
    plannerName: "Atelier Rose",
    eventTitle: "Layla & Adam's Summer Rooftop",
  },
  planner_assigned: {
    plannerName: "Nour Bassem",
    eventTitle: "Layla & Adam's Summer Rooftop",
  },
  payment_schedule_proposed: {
    plannerName: "Nour Bassem",
    eventTitle: "Layla & Adam's Summer Rooftop",
    amount: "EGP 120,000",
  },
  payment_schedule_amendment_proposed: {
    otherPartyName: "Nour Bassem",
    eventTitle: "Layla & Adam's Summer Rooftop",
  },
  payment_paid: {
    eventTitle: "Layla & Adam's Summer Rooftop",
    amount: "EGP 25,000",
  },
  payment_failed: {
    eventTitle: "Layla & Adam's Summer Rooftop",
    amount: "EGP 25,000",
  },
  payment_refunded: {
    eventTitle: "Layla & Adam's Summer Rooftop",
    amount: "EGP 12,500",
  },
  payment_disputed: {
    eventTitle: "Layla & Adam's Summer Rooftop",
    amount: "EGP 25,000",
  },
  payment_due_reminder: {
    eventTitle: "Layla & Adam's Summer Rooftop",
    amount: "EGP 25,000",
    dueDate: "Aug 20, 2026",
  },
  payment_overdue: {
    eventTitle: "Layla & Adam's Summer Rooftop",
    amount: "EGP 25,000",
    dueDate: "Aug 15, 2026",
  },
  // Planner
  event_in_service_area: {
    eventType: "wedding",
    eventTitle: "Golden hour engagement",
    city: "Cairo",
  },
  proposal_accepted: {
    clientName: "Layla Mahmoud",
    eventTitle: "Layla & Adam's Summer Rooftop",
  },
  proposal_released: {
    clientName: "Layla Mahmoud",
    eventTitle: "Layla & Adam's Summer Rooftop",
    rating: 4,
  },
  schedule_amendment_decided: {
    clientName: "Layla Mahmoud",
    eventTitle: "Layla & Adam's Summer Rooftop",
    decision: "accepted",
  },
  payment_received: {
    eventTitle: "Layla & Adam's Summer Rooftop",
    amount: "EGP 25,000",
    netAmount: "EGP 22,750",
  },
  payout_received: {
    amount: "EGP 42,300",
    method: "Bank transfer",
    reference: " Reference: ZF-2026-00481.",
  },
  vendor_accepted_engagement: {
    vendorName: "Bouquet Atelier",
    engagementTitle: "Ceremony florals",
  },
  vendor_declined_engagement: {
    vendorName: "Bouquet Atelier",
    engagementTitle: "Ceremony florals",
  },
  vendor_cancelled_engagement: {
    vendorName: "Bouquet Atelier",
    engagementTitle: "Ceremony florals",
  },
  review_received: {
    authorName: "Layla Mahmoud",
    rating: 5,
  },
  // Vendor
  engagement_requested: {
    plannerName: "Nada Hassan",
    engagementTitle: "Full-service floral (ceremony + reception)",
    totalAmount: "EGP 48,500",
    eventTitle: "Mariam & Youssef — Sep 14",
  },
  engagement_cancelled: {
    plannerName: "Nada Hassan",
    engagementTitle: "Full-service floral (ceremony + reception)",
  },
  engagement_items_updated: {
    plannerName: "Nada Hassan",
    engagementTitle: "Full-service floral (ceremony + reception)",
    totalAmount: "EGP 52,000",
  },
  // Vision Pack
  vision_pack_ready: {
    days: 60,
  },
  // Shared
  message_received: {
    senderName: "Nour, your planner",
    preview:
      "\u201cHey! Quick question about the floral palette — would you be open to a softer blush instead of coral?\u201d",
  },
  venue_lead_opened: {
    coupleName: "Layla & Adam",
    venueName: "Sahara Pavilion",
    venueCity: "Cairo",
    eventTitle: "Layla & Adam's Summer Rooftop",
  },
};

function parseArgs(): {
  email: string | null;
  userId: string | null;
  type: NotificationType | null;
  count: number;
  emailSend: boolean;
  deliverTo: string | null;
} {
  const args = process.argv.slice(2);
  let email: string | null = null;
  let userId: string | null = null;
  let type: NotificationType | null = null;
  let count = 1;
  let emailSend = false;
  let deliverTo: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--email") email = args[++i] ?? null;
    else if (a === "--user-id") userId = args[++i] ?? null;
    else if (a === "--type") type = (args[++i] ?? null) as NotificationType | null;
    else if (a === "--count") count = Math.max(1, Number(args[++i] ?? 1));
    else if (a === "--email-send") emailSend = true;
    else if (a === "--deliver-to") deliverTo = args[++i] ?? null;
  }
  return { email, userId, type, count, emailSend, deliverTo };
}

// Supabase Auth stores the canonical email. Profile.id mirrors auth.users.id
// so once we have the auth user we have the profile, but `.listUsers` is the
// only supported way to look one up by email from the admin SDK.
async function resolveUserIdByEmail(email: string): Promise<{
  id: string;
  email: string;
} | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  // Page through users. Realistically a dev DB has few enough that one page
  // is fine; cap at 5 pages so we never loop forever.
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (found) return { id: found.id, email: found.email ?? email };
    if (data.users.length < 1000) break;
  }
  return null;
}

async function main() {
  const { email, userId, type, count, emailSend, deliverTo } = parseArgs();
  if (!email && !userId) {
    console.error(
      "Error: pass --email <addr> or --user-id <uuid>.\n" +
        "Usage: npm run dev:seed-notification -- --email you@example.com [--type TYPE] [--count N] [--email-send] [--deliver-to OTHER_ADDR]",
    );
    process.exit(1);
  }

  let resolvedId: string;
  let resolvedEmail: string | null = null;
  if (userId) {
    resolvedId = userId;
  } else {
    const u = await resolveUserIdByEmail(email!);
    if (!u) {
      console.error(`No Supabase Auth user found for email=${email}`);
      process.exit(1);
    }
    resolvedId = u.id;
    resolvedEmail = u.email;
  }

  const profile = await prisma.profile.findUnique({
    where: { id: resolvedId },
    select: { id: true, role: true, locale: true, full_name: true },
  });
  if (!profile) {
    console.error(
      `Auth user ${resolvedId} has no matching profile row in the public.profiles table.`,
    );
    process.exit(1);
  }
  console.log(
    `Seeding notifications for ${resolvedEmail ?? profile.id} (role=${profile.role}, id=${profile.id})`,
  );

  const template: Array<{ type: NotificationType; link: string; vars: SeedVars }> =
    type
      ? [
          {
            type,
            link: "/dashboard/notifications",
            vars: DEMO_VARS[type] ?? {},
          },
        ]
      : DEMO_SEQUENCE;

  const locale: "en" | "ar" = profile.locale === "ar" ? "ar" : "en";

  // Resolve title/body lazily via `getCopy` so DB rows carry the same
  // templated strings the email does. Falls back to an in-file stub if
  // the module isn't importable (shouldn't happen in practice).
  const { getCopy } = await import("../src/server/services/notifications/copy");

  const toInsert: Prisma.NotificationCreateManyInput[] = [];
  for (let i = 0; i < count; i++) {
    for (const t of template) {
      const copy = getCopy(t.type, locale, t.vars);
      const suffix = count > 1 ? ` (#${i + 1})` : "";
      toInsert.push({
        user_id: profile.id,
        type: t.type,
        title: `${copy.title}${suffix}`,
        body: copy.body,
        link: t.link,
        data: {},
      });
    }
  }

  const result = await prisma.notification.createMany({ data: toInsert });
  console.log(`Inserted ${result.count} notification row(s).`);

  if (emailSend) {
    // --deliver-to takes precedence so we can send to mail-tester / Litmus
    // / a colleague's inbox while still anchoring the DB row + unsubscribe
    // token to the resolved user.
    const recipient = deliverTo ?? resolvedEmail;
    if (!recipient) {
      console.warn(
        "--email-send skipped: no address to deliver to. Re-run with --email or --deliver-to.",
      );
    } else if (!process.env.RESEND_API_KEY) {
      console.warn("--email-send skipped: RESEND_API_KEY is not set.");
    } else {
      const { sendNotificationEmail } = await import(
        "../src/server/services/notifications/email"
      );
      for (const t of template) {
        const copy = getCopy(t.type, locale, t.vars);
        const ok = await sendNotificationEmail({
          to: recipient,
          locale,
          copy,
          ctaHref: t.link,
          userId: profile.id,
        });
        console.log(
          `  [email:${t.type}] ${ok ? "sent" : "skipped"} -> ${recipient}${deliverTo ? " (overridden)" : ""}`,
        );
      }
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
