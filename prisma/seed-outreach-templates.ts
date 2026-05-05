// Seeds the OutreachTemplate table with the canonical cold-outreach copy
// used by the prospecting pipeline.
//
// One template body, used verbatim across every channel × prospect-type
// combination the picker can request (planner / vendor / unknown × email /
// whatsapp / instagram). The founder asked for a single pitch sent to
// everyone, with no per-channel shortening or per-type variation. The LLM
// in draftMessage() still personalizes [الاسم] (first name), [حاجة محددة]
// (a specific concrete detail from their bio/work), and [رابط] (the
// invitation URL), but otherwise passes the body through as-is.
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
// One body, used everywhere. Placeholders the LLM will fill at draft time:
//   [الاسم]      → prospect first name
//   [حاجة محددة] → 1 concrete detail from their bio/work (a city, vibe, recent
//                   shoot, specialty…) — chosen by the LLM, never invented
//   [رابط]       → personalized https://zaffa.ai/join?invitation=… URL
// ---------------------------------------------------------------------------

const SHARED_BODY = `أهلاً [الاسم] 🌸

تابعت شغلك في [حاجة محددة] وحقيقي بهرني الذوق والتفاصيل، عشان كده حبينا نوصلك.

احنا من برنامج زفّة، اتأسست بعد تجربة تخطيط حقيقية كانت كابوس — قعدة بين 10 جروبات واتساب، جداول مالهاش آخر، ومحدش عارف مين بيعمل إيه. فكرنا في حاجة بسيطة: منصة واحدة تجمع العرسان، التصميم, المخططين، الموردين، الدفع، والمتابعة في مكان واحد — عشان المخطط يركز على الإبداع، مش على إدارة الفوضى.

إحنا لسه في البداية، وبنحب نبني المنصة مع ناس بتفهم الشغل من جواه. يشرفنا تجرب زفّة وتقولنا رأيك بصراحة — إيه اللي شغال، إيه اللي ناقص، وإيه اللي ممكن نخليه أحسن و يساعدك في شغلك.

وعشان نقدّر الناس اللي معانا من الأول، بنجهز سلسلة من الـ incentives للمخططين الأوائل خلال الشهور الجاية:

✅ 5,000 جنيه مكافآت مرتبطة بالاستخدام الفعلي
✅ نسبة عمولة مميزة لأول 6 شهور
✅ ظهور مميز في الصفحة الرئيسية
✅ و اكتر قريبًا 🎁

مفيش commitment ومفيش تكلفة، بس فرصة تكون من أول الناس اللي يشكّلوا المنصة.

لينك التجربة:
[رابط]

في انتظار رأيك،
فريق زفّة`;

const SUBJECT = "من زفّة";

const CHANNELS = ["email", "whatsapp", "instagram"] as const;
const TYPES: ProspectType[] = ["planner", "vendor", "unknown"];

const ALL_TEMPLATES: TemplateSeed[] = CHANNELS.flatMap((channel) =>
  TYPES.map((type) => ({
    name: `${channel} · ${type} · Founding Planner pitch`,
    channel,
    type,
    subject: channel === "email" ? SUBJECT : null,
    body: SHARED_BODY,
  })),
);

async function main() {
  // Wipe everything first — full replacement of any previous copy. Anything
  // custom in the table will be removed; if you need it preserved, snapshot
  // before running.
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
