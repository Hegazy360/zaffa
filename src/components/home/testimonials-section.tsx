import { getTranslations } from "next-intl/server";
import { isFlagEnabled } from "@/lib/flags";
import { MIN_TESTIMONIALS, TESTIMONIALS } from "@/lib/testimonials";

/**
 * Testimonials — structurally incapable of showing a quote we did not get.
 *
 * Two independent gates, either of which renders nothing: the `testimonials`
 * flag, and the fact that `TESTIMONIALS` is empty until real couples have said
 * something real. Flipping the flag on today changes nothing on the page.
 *
 * Ships now, empty, so that publishing the first genuine quote is a one-line
 * data change on the day it arrives rather than a design exercise.
 */
export async function TestimonialsSection() {
  if (!isFlagEnabled("testimonials")) return null;
  if (TESTIMONIALS.length < MIN_TESTIMONIALS) return null;

  const t = await getTranslations("marketing");

  return (
    <section className="border-t border-brand-line bg-background py-20 md:py-28">
      <div className="container mx-auto max-w-6xl px-4">
        <h2 className="font-display text-3xl font-light tracking-tight md:text-4xl">
          {t("testimonialsTitle")}
        </h2>
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-brand-line bg-white/70 p-6"
            >
              {/* `lang` and `dir` per quote: a quote given in Arabic stays
                  Arabic on the English page, and must still shape and align
                  correctly there. */}
              <blockquote
                lang={item.locale}
                dir={item.locale === "ar" ? "rtl" : "ltr"}
                className="text-pretty text-sm leading-relaxed"
              >
                {item.quote}
              </blockquote>
              <p className="mt-4 text-xs text-muted-foreground">
                {item.attribution} · {item.city}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
