import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Globe, MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/logger";

/**
 * Social proof, made only of things that are actually true.
 *
 * What was here: four Unsplash stock headshots presented as customers, five
 * filled stars, an invented "4.9", and "Loved by 10,000+ couples". The real
 * numbers at time of writing are 31 renders across 14 accounts, most of them
 * ours. On a product whose entire proposition is "trust us with your wedding",
 * that gap is not a growth shortcut - it is the one lie that, if noticed,
 * invalidates every other claim on the page.
 *
 * The replacement has three parts, and two of them are silent today by design:
 *
 *  1. Thumbnails of real renders, from couples who published their microsite
 *     to the public gallery. Consent is the gate. Hidden below three, because
 *     two avatars read as "nobody uses this".
 *  2. A live count, hidden below a floor high enough that the number is worth
 *     saying. It turns itself on when the business earns it - no code change,
 *     no one deciding it's time to start rounding up.
 *  3. A trust line that is true on day one: who answers, in which languages,
 *     from where. For a couple who cannot tell good vendors from bad ones,
 *     "a person replies to you in Arabic on WhatsApp" outranks any rating.
 *
 * Server component, so the counts are real rather than guessed. It renders as
 * a slot inside the client hero.
 */

/** The count is worth showing only once it is genuinely impressive. Below
 *  this, silence beats a small number dressed up as momentum. */
const COUNT_FLOOR = 250;

/** Three is the smallest strip that reads as "other people are here". */
const MIN_THUMBS = 3;

/** Always rounded DOWN, so the figure can never be an overstatement. */
function roundDown(n: number): number {
  if (n < 1000) return Math.floor(n / 50) * 50;
  return Math.floor(n / 100) * 100;
}

async function loadProof(): Promise<{ count: number; thumbs: string[] }> {
  // Consent is the gate: only packs whose owners published their microsite
  // publicly, which is the same condition /gallery uses.
  const [count, packs] = await Promise.all([
    prisma.venueDesignMedia.count({ where: { type: "render" } }),
    prisma.visionPack.findMany({
      where: {
        microsite_public: true,
        microsite_published_at: { not: null },
        status: { in: ["active", "fulfilled"] },
      },
      orderBy: { microsite_published_at: "desc" },
      take: 8,
      select: { recipient_user_id: true },
    }),
  ]);

  const recipientIds = [
    ...new Set(
      packs
        .map((p) => p.recipient_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (recipientIds.length === 0) return { count, thumbs: [] };

  // One grouped query rather than a render lookup per couple.
  const designs = await prisma.venueDesign.findMany({
    where: { user_id: { in: recipientIds } },
    orderBy: [{ user_id: "asc" }, { updated_at: "desc" }],
    select: {
      user_id: true,
      media: {
        where: { type: "render" },
        orderBy: { created_at: "desc" },
        take: 1,
        select: { url: true },
      },
    },
  });

  // One render per couple, four thumbnails of the same wedding is not proof
  // that four couples exist.
  //
  // Note the loop keeps scanning a user's designs until it finds one with a
  // render, rather than taking their newest design and giving up if it is
  // empty. The newest design is frequently an abandoned draft, which is how
  // the gallery ended up showing placeholder icons for a couple with fourteen
  // renders.
  const seen = new Set<string>();
  const thumbs: string[] = [];
  for (const d of designs) {
    if (seen.has(d.user_id)) continue;
    const url = d.media[0]?.url;
    if (!url) continue;
    seen.add(d.user_id);
    thumbs.push(url);
    if (thumbs.length === 4) break;
  }
  return { count, thumbs };
}

export async function HeroSocialProof() {
  const t = await getTranslations("marketing");

  let count = 0;
  let thumbs: string[] = [];
  try {
    ({ count, thumbs } = await loadProof());
  } catch (err) {
    // Proof must never take the homepage down. Degrading to the trust line
    // alone costs nothing, because that line does not depend on the database.
    reportError("hero.social_proof_failed", err);
  }

  const showThumbs = thumbs.length >= MIN_THUMBS;
  const showCount = count >= COUNT_FLOOR;

  return (
    <div
      style={{ animationDelay: "0.4s" }}
      className="hero-rise mt-10 flex flex-col gap-3 sm:mt-12"
    >
      {(showThumbs || showCount) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {showThumbs && (
            <div className="flex -space-x-3 rtl:space-x-reverse">
              {thumbs.map((src, i) => (
                <div
                  key={src}
                  style={{ zIndex: thumbs.length - i }}
                  className="relative size-10 overflow-hidden rounded-full border-2 border-background shadow-sm"
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}
          {showCount && (
            <p className="text-sm text-muted-foreground">
              {t("heroSocialProof", { count: roundDown(count) })}
            </p>
          )}
        </div>
      )}

      {/* True on day one, and the thing a lost couple actually wants to know:
          a person answers, in their language, wherever they are getting
          married. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="size-3.5 shrink-0" aria-hidden />
          {t("heroTrustChannels")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Globe className="size-3.5 shrink-0" aria-hidden />
          {t("heroTrustReach")}
        </span>
      </div>
    </div>
  );
}
