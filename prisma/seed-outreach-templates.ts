// Seeds the OutreachTemplate table with the canonical set of cold-outreach
// templates used by the prospecting pipeline.
//
// Tone: Egyptian Arabic (masry / colloquial), warm and human. The pitch is
//   - free for the planner/vendor (no listing fees, no subscription)
//   - couples & planners post briefs → you get a notification with the full
//     details → you submit a proposal in a couple of minutes
//   - we just want to make finding work easier, more transparent, and less
//     of a chase
//   - door is always open: any question, just reply
//
// Each template body is passed verbatim to the LLM in `draftMessage()`. The
// LLM rewrites it for each prospect, weaving in 1-2 specific facts (a city,
// a recent shoot, a vibe) and appending the personalized invitation URL.
// We deliberately do NOT mention the prospect's business name; the LLM
// uses {first_name} for the greeting and pulls something concrete from the
// bio for the compliment.
//
// We seed only the three primary buckets (planner / vendor / unknown) per
// channel — the new pitch doesn't change meaningfully across vendor
// categories, and the LLM personalizes every send anyway. If you ever need
// a category-specific override, the admin UI can add one without changing
// this file.
//
// IMPORTANT: this script wipes the entire OutreachTemplate table before
// inserting. Any templates created via the admin UI will be removed —
// re-add them through the UI after running. This matches the "delete all
// and replace" semantics the founder asked for.
//
// Run with: npm run db:seed-outreach-templates

import { PrismaClient } from "../src/generated/prisma/client";
import type { ProspectType } from "../src/generated/prisma/client";
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
  subject?: string | null;
  body: string;
}

// ---------------------------------------------------------------------------
// EMAIL — Egyptian Arabic, low-key and short. Subject is mandatory but kept
// flat (no teasers, no hype). We end on the bare https://zaffa.ai sentinel;
// the LLM swaps it for the personalized /join?invitation=… URL during
// draftMessage().
// ---------------------------------------------------------------------------

const EMAIL_TEMPLATES: TemplateSeed[] = [
  {
    name: "Email · Planner · Egyptian Arabic intro",
    channel: "email",
    type: "planner",
    subject: "من زفّة",
    body: `ازيك يا {first_name}،

شُفت شغلك في تنظيم الأفراح وعجبني، فحبّيت أبعتلك.

أنا من زفّة (zaffa.ai)، منصّة مصرية جديدة للأفراح والمناسبات. الفكرة باختصار: لمّا أيّ كابل يدوّر على منظّم، بيكتب تفاصيل فرحه على المنصّة — تاريخ، ميزانية، عدد المعازيم، الأسلوب اللي عايزه. بيوصلك إشعار بالتفاصيل دي، ولو الشغل يناسبك تبعت عرضك في دقيقتين.

مفيش اشتراك ولا رسوم، المنصّة مجانية عليك. الفكرة بس إننا نسهّل وصول الشغل ونخلّي العملية شفّافة من غير جري ورا حد.

دي دعوتك تنضمّ من اللينك ده:
https://zaffa.ai

أيّ سؤال، ردّ على الإيميل ده في أيّ وقت.

تحياتي،
فريق زفّة`,
  },
  {
    name: "Email · Vendor · Egyptian Arabic intro",
    channel: "email",
    type: "vendor",
    subject: "من زفّة",
    body: `ازيك يا {first_name}،

شُفت شغلك وعجبني، فحبّيت أبعتلك.

أنا من زفّة (zaffa.ai)، منصّة مصرية جديدة للأفراح والمناسبات. لمّا أيّ منظّم يدوّر على مورّد لمناسبة، بيكتب التفاصيل على المنصّة — التاريخ، الميزانية، الحاجات المطلوبة. بيوصلك إشعار وتقدر تبعت عرضك لو الشغل يناسبك.

كل حاجة من على المنصّة، والاشتراك مجاني عليك. الفكرة بس إننا نوفّر عليك الوقت ونوصّلك شغل بطريقة مرتّبة وشفّافة.

دي دعوتك تنضمّ:
https://zaffa.ai

أيّ سؤال، ردّ في أيّ وقت.

تحياتي،
فريق زفّة`,
  },
  {
    name: "Email · Unknown / general · Egyptian Arabic intro",
    channel: "email",
    type: "unknown",
    subject: "من زفّة",
    body: `ازيك يا {first_name}،

شُفت شغلك وحبّيت أبعتلك.

أنا من زفّة (zaffa.ai)، منصّة مصرية جديدة للأفراح والمناسبات بتربط العرسان بالمنظّمين والمورّدين. لمّا حد يدوّر على فريق لمناسبة، بيوصل إشعار للناس اللي شغلهم مناسب بكل التفاصيل وبيقدروا يبعتوا عروضهم.

المنصّة مجانية. لو شغلك ليه علاقة بعالم الأفراح، يا ريت تردّ بسطر صغير عن طبيعة شغلك وأنا هاكمّل معاك. أو خد جولة من اللينك ده:
https://zaffa.ai

أيّ سؤال، أنا موجود.

تحياتي،
فريق زفّة`,
  },
];

// ---------------------------------------------------------------------------
// WHATSAPP — قصيرة ولـ low-key، حوالي 50-70 كلمة. مفيش subject. مفيش
// emoji زيادة (الـ 👋 في الافتتاحية كافي).
// ---------------------------------------------------------------------------

const WHATSAPP_TEMPLATES: TemplateSeed[] = [
  {
    name: "WhatsApp · Planner · Egyptian Arabic intro",
    channel: "whatsapp",
    type: "planner",
    body: `ازيك يا {first_name}، شُفت شغلك وعجبني فحبّيت أبعتلك.

أنا من زفّة (zaffa.ai)، منصّة مصرية جديدة للأفراح. لمّا أيّ كابل يدوّر على منظّم، بيوصلك إشعار بتفاصيل المناسبة (تاريخ، ميزانية، عدد المعازيم) وتقدر تبعت عرضك في دقيقتين. مفيش اشتراك، كله مجاني.

دي دعوتك تنضمّ:
https://zaffa.ai

أيّ سؤال، كلّمني هنا.`,
  },
  {
    name: "WhatsApp · Vendor · Egyptian Arabic intro",
    channel: "whatsapp",
    type: "vendor",
    body: `ازيك يا {first_name}، شُفت شغلك وعجبني فحبّيت أبعتلك.

أنا من زفّة (zaffa.ai)، منصّة مصرية جديدة للأفراح والمناسبات. لمّا أيّ منظّم يدوّر على مورّد لمناسبة، بيوصلك إشعار بالتفاصيل وتقدر تبعت عرضك لو الشغل يناسبك. مفيش اشتراك، كله مجاني.

دي دعوتك تنضمّ:
https://zaffa.ai

أيّ سؤال، أنا موجود.`,
  },
  {
    name: "WhatsApp · Unknown / general · Egyptian Arabic intro",
    channel: "whatsapp",
    type: "unknown",
    body: `ازيك يا {first_name}، شُفت شغلك وحبّيت أبعتلك.

أنا من زفّة (zaffa.ai)، منصّة مصرية جديدة للأفراح والمناسبات بتربط العرسان بالمنظّمين والمورّدين. كل اللي شغله مناسب لأيّ مناسبة بيوصله إشعار وبيبعت عرضه. المنصّة مجانية.

لو شغلك ليه علاقة بالعالم ده، اللينك ده ليك:
https://zaffa.ai`,
  },
];

// ---------------------------------------------------------------------------
// INSTAGRAM DM — أقصر حاجة، 30-50 كلمة. مفيش emoji ولا hype — chat
// عادي ما بين شخصين.
// ---------------------------------------------------------------------------

const INSTAGRAM_TEMPLATES: TemplateSeed[] = [
  {
    name: "Instagram · Planner · Egyptian Arabic soft intro",
    channel: "instagram",
    type: "planner",
    body: `ازيك يا {first_name}، شُفت شغلك وعجبني.

أنا من زفّة (zaffa.ai)، منصّة مصرية جديدة للأفراح. لمّا حد يدوّر على منظّم، بيوصلك إشعار بالتفاصيل وتقدر تبعت عرضك. كله مجاني.

اللينك ده ليك:
https://zaffa.ai`,
  },
  {
    name: "Instagram · Vendor · Egyptian Arabic soft intro",
    channel: "instagram",
    type: "vendor",
    body: `ازيك يا {first_name}، شُفت شغلك وعجبني.

أنا من زفّة (zaffa.ai)، منصّة مصرية جديدة للأفراح. أيّ منظّم بيدوّر على مورّد لمناسبة، بيوصلك إشعار وتقدر تبعت عرضك. كله مجاني.

اللينك ده ليك:
https://zaffa.ai`,
  },
  {
    name: "Instagram · Unknown / general · Egyptian Arabic soft intro",
    channel: "instagram",
    type: "unknown",
    body: `ازيك يا {first_name}، شُفت شغلك وحبّيت أبعتلك.

أنا من زفّة (zaffa.ai)، منصّة مصرية جديدة للأفراح. لو شغلك ليه علاقة بالعالم ده، خد جولة من هنا:
https://zaffa.ai`,
  },
];

const ALL_TEMPLATES: TemplateSeed[] = [
  ...EMAIL_TEMPLATES,
  ...WHATSAPP_TEMPLATES,
  ...INSTAGRAM_TEMPLATES,
];

async function main() {
  // Wipe everything first — the founder asked for a full replacement of
  // the previous English founding-partner pitch with the new Egyptian
  // Arabic copy. Anything custom in the table will be removed; if you
  // need it preserved, snapshot first.
  const removed = await prisma.outreachTemplate.deleteMany({});
  console.log(`Removed ${removed.count} existing templates.`);

  console.log(`Seeding ${ALL_TEMPLATES.length} outreach templates…`);
  let created = 0;
  for (const tpl of ALL_TEMPLATES) {
    await prisma.outreachTemplate.create({
      data: {
        name: tpl.name,
        channel: tpl.channel,
        type: tpl.type,
        category: null,
        subject: tpl.subject ?? null,
        body: tpl.body,
        active: true,
      },
    });
    created += 1;
  }
  console.log(`Done. Created ${created} templates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
