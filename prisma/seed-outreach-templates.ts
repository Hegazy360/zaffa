// Seeds the OutreachTemplate table with a baseline set of high-quality
// outreach templates for the prospecting pipeline.
//
// We cover all three channels (email / whatsapp / instagram) for every
// ProspectType (planner / vendor / unknown), plus a handful of
// vendor-category-specific variants for our highest-volume verticals
// (photography, flowers, decoration, catering, makeup, music, venue,
// videography). The router prefers a category-specific match before
// falling back to the generic "vendor" template, so adding more later
// just plugs in without code changes.
//
// IMPORTANT: these template bodies are passed verbatim to the LLM in
// `draftMessage()`. The LLM rewrites them for each prospect, weaving in
// 1-2 specific facts (name, handle, city, bio) and translating to Arabic
// when the prospect's bio is Arabic. So we write in clear English with a
// warm, casual, human voice and a soft CTA pointing at https://zaffa.ai.
// We deliberately do NOT reference the business name — the LLM picks
// something more specific (a recent shoot, a city, a vibe) from the
// prospect's bio for that.
//
// Run with: npm run db:seed-outreach-templates

import { PrismaClient } from "../src/generated/prisma/client";
import type { ProspectType, VendorCategory } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_DATABASE_URL or DATABASE_URL must be set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface TemplateSeed {
  name: string;
  channel: "email" | "whatsapp" | "instagram";
  type: ProspectType;
  category?: VendorCategory | null;
  subject?: string | null;
  body: string;
}

// ---------------------------------------------------------------------------
// EMAIL — friendly but still email-shaped, ~120-160 words. Subject is
// mandatory. Tone: a real person writing, not a deck.
// ---------------------------------------------------------------------------

const EMAIL_TEMPLATES: TemplateSeed[] = [
  {
    name: "Email · Planner · Founding partner invite",
    channel: "email",
    type: "planner",
    subject: "Loved your work — quick hello from Zaffa",
    body: `Hi {first_name},

Hope you're doing well! I came across your work while looking at the planners doing really beautiful events in Egypt right now and honestly, I had to reach out.

I'm with Zaffa (zaffa.ai) — we're a new Egyptian wedding and events marketplace, built to connect couples directly with planners and vendors. AI-powered style matching, clean quoting, payments handled through Stripe so you stop chasing deposits. The boring stuff, finally not boring.

We're putting together a small founding group of planners and would genuinely love to have you in it. Founding partners get a verified profile, top placement, no listing fees in the first year, and direct input on what we build next.

Would you be up for a quick 20-minute call this week? If now's not the right moment, totally fine — just wanted to put it on your radar.

Warmly,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Vendor · Generic intro",
    channel: "email",
    type: "vendor",
    subject: "Loved your work — quick hello from Zaffa",
    body: `Hi {first_name},

Hope you're well! I've been spending some time discovering the best wedding and event vendors in Egypt and your work really stood out — wanted to reach out and say hi.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding and events marketplace. The short version: couples and planners come to us already serious about booking, and we hand off real briefs with budgets attached. Deposits and balance flow through Stripe, so you don't have to chase anyone for anything.

We're building a small founding group of vendors and we'd love you in it. Founding partners get a verified profile, priority placement, and zero commission on their first three bookings.

Would a quick 15-minute call this week work? Happy to just send screenshots if a call feels like too much — whatever's easiest for you.

Best,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Photographer · Portfolio-led",
    channel: "email",
    type: "vendor",
    category: "photography",
    subject: "Your photography stopped me — quick hello",
    body: `Hi {first_name},

Hope you're doing well! I've been deep in wedding photography from Egypt the past couple of weeks and your work genuinely stopped me. Just wanted to reach out and say so.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding marketplace. Couples on the platform build a visual style profile and we surface the photographers whose work matches their taste — so the inquiries you get already love your aesthetic, with a real date and budget attached. No DM ping-pong, no chasing deposits.

We're inviting a small founding group of photographers in right now: verified profile, featured placement, and zero commission on your first three weddings.

Would 15 minutes this week work for a quick walkthrough? Happy to share what other photographers are seeing so far.

Best,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Florist · Portfolio-led",
    channel: "email",
    type: "vendor",
    category: "flowers",
    subject: "Couples on Zaffa would love your florals",
    body: `Hi {first_name},

Hope you're doing well! I've been looking at florists working on weddings in Egypt and your work is exactly the aesthetic our couples are saving to their mood boards. Had to reach out.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding marketplace. Couples build a visual style profile and we match them with florists whose work they already love — so the briefs you get arrive with a real wedding date, a real budget, and someone who's actually excited about your style. Deposits and final payments run through Stripe.

We're handpicking a small founding group of florists right now: verified profile, top placement, and zero commission on your first three weddings.

Would you have 15 minutes this week to take a quick look? Totally no pressure if it's not a fit.

Warmly,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Decoration vendor · Portfolio-led",
    channel: "email",
    type: "vendor",
    category: "decoration",
    subject: "Your styling is gorgeous — quick hello",
    body: `Hi {first_name},

Hope you're well! I've been looking at the event designers and decorators doing the most beautiful work in Egypt and yours really stood out — the styling, the lighting, the overall feel. Wanted to reach out and say hi.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding and events marketplace. Couples and planners discover decorators here through real portfolios and AI-powered style matches, then book directly through the platform with Stripe-backed deposits. Briefs are clear, budgets are real, and you don't waste time on tire-kickers.

We're putting together a small founding group of decorators: verified profile, top placement, and zero commission on your first three events.

Would 15 minutes this week work for a quick look? Happy to just send a few screenshots if a call feels like too much.

Best,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Catering · Portfolio-led",
    channel: "email",
    type: "vendor",
    category: "catering",
    subject: "Your menu kept coming up — quick hello",
    body: `Hi {first_name},

Hope you're doing well! I've been mapping out the catering teams that the best planners in Egypt actually book and your name kept coming up. Wanted to reach out.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding and events marketplace. Couples and planners come to us with a confirmed venue, guest count, and a real budget — we hand off qualified leads through a clean dashboard, with deposits and balance handled via Stripe. So less chasing, more cooking.

We're putting together a small founding group of caterers right now: verified profile, top placement, and zero commission on your first three bookings.

Would a quick 20-minute call this week work? Always happy to share what other caterers are seeing so far.

Warmly,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Makeup artist · Portfolio-led",
    channel: "email",
    type: "vendor",
    category: "makeup",
    subject: "Your bridal looks are stunning — quick hello",
    body: `Hi {first_name},

Hope you're well! I've been looking at the bridal makeup artists doing really beautiful work in Egypt and yours really stood out — the looks are clean, modern, and exactly what brides on our platform are saving.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding marketplace. Brides build a visual style profile and we surface the artists whose work matches their taste, so inquiries arrive with a real wedding date and a real budget. Deposits and final payments run through Stripe — no chasing.

We're inviting a small founding group of makeup artists in right now: verified profile, featured placement, and zero commission on your first three weddings.

Would 15 minutes this week work? Happy to send screenshots if a call feels like too much.

Best,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Music / DJ / Band · Portfolio-led",
    channel: "email",
    type: "vendor",
    category: "music",
    subject: "Your sound is exactly the vibe — quick hello",
    body: `Hi {first_name},

Hope you're doing well! I've been listening through the live bands and DJs that planners in Egypt actually book and your sound is exactly the vibe couples on our platform are looking for. Wanted to reach out.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding and events marketplace. Couples and planners come to us with a confirmed venue, date, and budget; we surface the right entertainment based on style and energy, and handle deposits and balance through Stripe so you don't chase anyone.

We're putting together a small founding group of music acts right now: verified profile, priority placement, and zero commission on your first three bookings.

Would 15 minutes this week work for a quick look? Or I can just send screenshots — whatever's easier.

Best,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Venue · Portfolio-led",
    channel: "email",
    type: "vendor",
    category: "venue",
    subject: "Your venue is gorgeous — quick hello",
    body: `Hi {first_name},

Hope you're well! I've been mapping out the most beautiful wedding venues in Egypt and yours is exactly the kind of space couples on our platform are saving to their shortlists. Had to reach out.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding and events marketplace. Couples filter venues by setting, capacity, and budget, so the inquiries that land in your inbox are already serious. Site-visit requests, deposits, and balance payments all flow through a single Stripe-backed dashboard — much less back-and-forth.

We're putting together a small founding group of venues right now: verified listing with a hero gallery, top placement in search, and zero commission on the first three bookings.

Would a quick 20-minute call this week work? Happy to just send screenshots if you'd prefer.

Warmly,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Videographer · Portfolio-led",
    channel: "email",
    type: "vendor",
    category: "videography",
    subject: "Your wedding films are beautiful — quick hello",
    body: `Hi {first_name},

Hope you're doing well! I've been watching wedding films from Egypt the past couple of weeks and your work genuinely stopped me — the pacing, the colour, the way you cut emotion into a highlight reel. Wanted to reach out.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding marketplace. Couples build a visual and stylistic profile and we surface the videographers whose work matches their taste, so briefs arrive with a real date and a real budget. Deposits and balance run through Stripe — no chasing.

We're inviting a small founding group of videographers in right now: verified profile, featured placement, and zero commission on your first three weddings.

Could I take 15 minutes of your time this week to walk you through it?

Best,
The Zaffa team
https://zaffa.ai`,
  },
  {
    name: "Email · Unknown / general · Soft intro",
    channel: "email",
    type: "unknown",
    subject: "Quick hello from Zaffa",
    body: `Hi {first_name},

Hope you're doing well! I came across your work and just wanted to reach out and say hi.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding and events marketplace. We connect couples directly with planners and vendors — AI-powered style matching, clean briefs, payments handled through Stripe.

I'd love to learn a bit more about what you do — whether you're a planner, a vendor, or somewhere in between — and see if there's a way Zaffa could help you reach more of the right couples.

Would you mind sending a quick reply with a sentence or two about your work? I can take it from there. Happy to share more about the platform on a call if it sounds interesting.

Warmly,
The Zaffa team
https://zaffa.ai`,
  },
];

// ---------------------------------------------------------------------------
// WHATSAPP — short and warm, ~60-80 words. Egyptian flavour, friendly. The
// LLM will translate to Arabic when the prospect's bio is Arabic.
// ---------------------------------------------------------------------------

const WHATSAPP_TEMPLATES: TemplateSeed[] = [
  {
    name: "WhatsApp · Planner · Founding partner",
    channel: "whatsapp",
    type: "planner",
    body: `Hey {first_name}! 👋 Hope you're doing well.

I'm reaching out from Zaffa (zaffa.ai), a new Egyptian wedding marketplace — your work caught my eye and we'd genuinely love to have you in our small founding group of planners.

Founding partners get a verified profile, top placement, no listing fees in the first year, and a direct line into our roadmap.

Could I steal 20 minutes this week for a quick walkthrough? No pressure if it's not the right moment. 🌹`,
  },
  {
    name: "WhatsApp · Vendor · Founding partner",
    channel: "whatsapp",
    type: "vendor",
    body: `Hey {first_name}! 👋 Hope you're well.

Reaching out from Zaffa (zaffa.ai) — a new Egyptian wedding & events marketplace. Your work really stood out while we were looking at the best vendors in Egypt and we'd love to have you in our founding group.

Founding partners get a verified profile, priority placement, and zero commission on the first three bookings.

Up for a quick 15-minute call this week? Or I can send screenshots — whatever's easier. 🙏`,
  },
  {
    name: "WhatsApp · Photographer · Founding",
    channel: "whatsapp",
    type: "vendor",
    category: "photography",
    body: `Hey {first_name}! 👋 Hope you're doing well.

I'm with Zaffa (zaffa.ai) — a new Egyptian wedding marketplace. Your photography genuinely stopped me while I was looking through photographers in Egypt and I had to reach out.

We're putting together a small founding group of photographers: verified profile, featured placement, zero commission on your first three weddings.

15 minutes this week for a quick chat? Or screenshots, totally up to you. 📸`,
  },
  {
    name: "WhatsApp · Florist · Founding",
    channel: "whatsapp",
    type: "vendor",
    category: "flowers",
    body: `Hey {first_name}! 👋 Hope you're well.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding marketplace. Couples here build a visual style profile and we match them with florists whose work they already love — and yours is exactly what they're saving.

We'd love to bring you in as a founding florist: verified profile, top placement, zero commission on your first three weddings.

15 minutes this week for a quick chat? 🌸`,
  },
  {
    name: "WhatsApp · Unknown / general",
    channel: "whatsapp",
    type: "unknown",
    body: `Hey {first_name}! 👋 Hope you're doing well.

Quick hello from Zaffa (zaffa.ai) — we're a new Egyptian wedding & events marketplace connecting couples with planners and vendors.

I came across your work and wanted to reach out. Whether you're a planner, vendor, or something in between, I'd love to learn what you do and see if there's a fit.

Could you share a sentence or two about your work? I'll take it from there. 🌹`,
  },
];

// ---------------------------------------------------------------------------
// INSTAGRAM DM — very short, casual, ~40-60 words, low-friction. The first
// message has to earn the second; we ask for permission, not a meeting.
// ---------------------------------------------------------------------------

const INSTAGRAM_TEMPLATES: TemplateSeed[] = [
  {
    name: "Instagram · Planner · Soft intro",
    channel: "instagram",
    type: "planner",
    body: `heyy {first_name} 👋 your feed is gorgeous, the styling on your last few events is unreal.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding marketplace — putting together a tiny founding group of planners and would love you in it.

cool if I drop a few quick details here? no call needed unless you want one 🌹`,
  },
  {
    name: "Instagram · Vendor · Soft intro",
    channel: "instagram",
    type: "vendor",
    body: `heyy {first_name} 👋 your work caught my eye, really beautiful stuff.

I'm with Zaffa (zaffa.ai), a new Egyptian wedding & events marketplace. we're putting together a small founding group of vendors and your portfolio is exactly the energy we want couples to discover.

cool if I send a few quick details here? promise it's quick 🙏`,
  },
  {
    name: "Instagram · Photographer · Soft intro",
    channel: "instagram",
    type: "vendor",
    category: "photography",
    body: `heyy {first_name} 👋 your photography is stunning, the candid stuff especially 😍

I'm with Zaffa (zaffa.ai), a new Egyptian wedding marketplace. we're handpicking a tiny founding group of photographers right now and your work is exactly the vibe.

cool if I drop a few details here? 📸`,
  },
  {
    name: "Instagram · Florist · Soft intro",
    channel: "instagram",
    type: "vendor",
    category: "flowers",
    body: `heyy {first_name} 👋 the florals on your feed are beautiful — couples on Zaffa are literally saving work like yours 🌸

I'm with Zaffa (zaffa.ai), a new Egyptian wedding marketplace. inviting a tiny founding group of florists in now.

cool if I drop a few quick details here?`,
  },
  {
    name: "Instagram · Unknown / general",
    channel: "instagram",
    type: "unknown",
    body: `heyy {first_name} 👋 came across your feed and loved the work.

I'm with Zaffa (zaffa.ai) — a new Egyptian wedding & events marketplace. not totally sure yet if you're a planner, vendor, or something else, but if there's a fit I'd love to chat.

mind sharing a sentence or two about what you do? 🌹`,
  },
];

const ALL_TEMPLATES: TemplateSeed[] = [
  ...EMAIL_TEMPLATES,
  ...WHATSAPP_TEMPLATES,
  ...INSTAGRAM_TEMPLATES,
];

async function main() {
  console.log(`Seeding ${ALL_TEMPLATES.length} outreach templates…`);

  let created = 0;
  let updated = 0;
  for (const tpl of ALL_TEMPLATES) {
    // We use `name` as the upsert key. There's no DB-level unique on name
    // but we treat it as one in seeding so re-running is idempotent.
    const existing = await prisma.outreachTemplate.findFirst({
      where: { name: tpl.name },
      select: { id: true },
    });
    if (existing) {
      await prisma.outreachTemplate.update({
        where: { id: existing.id },
        data: {
          channel: tpl.channel,
          type: tpl.type,
          category: tpl.category ?? null,
          subject: tpl.subject ?? null,
          body: tpl.body,
          active: true,
        },
      });
      updated += 1;
    } else {
      await prisma.outreachTemplate.create({
        data: {
          name: tpl.name,
          channel: tpl.channel,
          type: tpl.type,
          category: tpl.category ?? null,
          subject: tpl.subject ?? null,
          body: tpl.body,
          active: true,
        },
      });
      created += 1;
    }
  }

  console.log(`Done. Created ${created}, updated ${updated}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
