/**
 * Renders every (or a specific) notification-email variant to disk as
 * standalone HTML + TXT files. No network, no database, no Resend. Just
 * a fast visual check of the editorial template's output.
 *
 * Usage:
 *   npm run dev:preview-emails
 *   npm run dev:preview-emails -- --type proposal_received
 *   npm run dev:preview-emails -- --locale ar
 *   npm run dev:preview-emails -- --out ./tmp/preview
 *
 * Defaults:
 *   --out     ./tmp/email-previews
 *   --locale  en
 *   (no --type) — renders all 24 types
 *
 * Open the generated files directly in a browser to preview. The text
 * alternative is written alongside each HTML file for quick diffing.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getCopy, type Locale } from "../src/server/services/notifications/copy";
import { renderEmail } from "../src/server/services/notifications/email";
import type { NotificationType } from "../src/generated/prisma/client";

type Vars = Record<string, string | number>;

// Mirrors scripts/seed-notification.ts DEMO_VARS, kept in sync by hand.
// Duplicated intentionally — this script is a devtool and we don't want
// a runtime dependency on seed-notification's internals.
const DEMO_VARS: Record<NotificationType, Vars> = {
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
  message_received: {
    senderName: "Nour, your planner",
    preview:
      "\u201cHey! Quick question about the floral palette — would you be open to a softer blush instead of coral?\u201d",
  },
  vision_pack_ready: {
    days: 60,
  },
  venue_lead_opened: {
    coupleName: "Layla & Adam",
    venueName: "Sahara Pavilion",
    venueCity: "Cairo",
    eventTitle: "Layla & Adam's Summer Rooftop",
  },
  enquiry_received: {
    fullName: "Noor & Faisal",
    city: "Dubai",
    guests: "150–200 guests",
    channel: "WhatsApp",
  },
  design_approved: {
    coupleName: "Noor & Faisal",
    designName: "Garden Nikah, Dusty Rose",
  },
};

function parseArgs(): {
  type: NotificationType | null;
  locale: Locale;
  out: string;
} {
  const args = process.argv.slice(2);
  let type: NotificationType | null = null;
  let locale: Locale = "en";
  let out = "./tmp/email-previews";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--type") type = (args[++i] ?? null) as NotificationType | null;
    else if (a === "--locale") {
      const v = args[++i];
      locale = v === "ar" ? "ar" : "en";
    } else if (a === "--out") out = args[++i] ?? out;
  }
  return { type, locale, out };
}

async function main() {
  const { type, locale, out } = parseArgs();
  const outDir = resolve(process.cwd(), out);
  await mkdir(outDir, { recursive: true });

  const types = (type ? [type] : Object.keys(DEMO_VARS)) as NotificationType[];
  const indexRows: string[] = [];

  for (const t of types) {
    const vars = DEMO_VARS[t] ?? {};
    const copy = getCopy(t, locale, vars);
    const { subject, html, text } = renderEmail({
      locale,
      copy,
      ctaHref: "/dashboard/notifications",
      userId: "00000000-0000-0000-0000-000000000000",
    });
    const baseName = `${t}.${locale}`;
    const htmlPath = join(outDir, `${baseName}.html`);
    const txtPath = join(outDir, `${baseName}.txt`);
    await writeFile(htmlPath, html, "utf8");
    await writeFile(txtPath, text, "utf8");
    indexRows.push(
      `<li><a href="./${baseName}.html"><strong>${t}</strong></a> <span style="color:#857a74">— ${subject}</span> · <a href="./${baseName}.txt">plain text</a></li>`,
    );
    console.log(`  rendered ${t} (${locale}) -> ${htmlPath}`);
  }

  // Tiny index so the user can browse the whole set from one page.
  const index = `<!doctype html>
<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8" />
  <title>Zaffa email previews (${locale})</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background:#fff7f0; color:#1f1a17; padding:40px; max-width:720px; margin:0 auto; }
    h1 { font-family: Georgia, serif; font-weight:300; font-style:italic; color:#9f1239; letter-spacing:-0.01em; font-size:32px; margin:0 0 8px; }
    p.lede { color:#857a74; margin:0 0 24px; }
    ul { list-style:none; padding:0; }
    li { padding:10px 0; border-bottom:1px solid #f1e6dc; }
    a { color:#9f1239; text-decoration:none; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <h1>Zaffa email previews</h1>
  <p class="lede">Locale: <code>${locale}</code> · ${types.length} template(s). Open each to inspect.</p>
  <ul>${indexRows.join("\n    ")}</ul>
</body>
</html>`;
  await writeFile(join(outDir, `index.${locale}.html`), index, "utf8");
  console.log(`\nIndex: ${join(outDir, `index.${locale}.html`)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
