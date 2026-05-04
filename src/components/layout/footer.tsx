import Link from "next/link";
import { Instagram } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { isFlagEnabled } from "@/lib/flags";

// Lucide doesn't ship a TikTok glyph, so we render an inline SVG. Kept
// here (not in `components/icons/`) because it has exactly one consumer
// and inlining keeps the bundle one less import deep. Path data is the
// official TikTok logo simplified to a single `currentColor` stroke so
// it inherits text colour like every other footer icon.
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.86a8.16 8.16 0 0 0 4.77 1.52V6.93a4.85 4.85 0 0 1-1.84-.24Z" />
    </svg>
  );
}

interface SocialLink {
  href: string;
  labelKey: "footerSocialInstagram" | "footerSocialTiktok";
  Icon: React.ComponentType<{ className?: string }>;
}

// Single source of truth for the social icons rendered next to the
// copyright. Both handles point at `zaffa.ai` per the brand inventory.
const SOCIAL_LINKS: SocialLink[] = [
  {
    href: "https://instagram.com/zaffa.ai",
    labelKey: "footerSocialInstagram",
    Icon: ({ className }) => <Instagram className={className} aria-hidden />,
  },
  {
    href: "https://tiktok.com/@zaffa.ai",
    labelKey: "footerSocialTiktok",
    Icon: TikTokIcon,
  },
];

export async function Footer() {
  const t = await getTranslations("marketing");
  const tBrand = await getTranslations("brand");
  const year = new Date().getFullYear();
  const showBrowse = isFlagEnabled("publicBrowse");

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto max-w-7xl px-4 py-12">
        <div
          className={`grid grid-cols-1 gap-8 ${
            showBrowse ? "md:grid-cols-4" : "md:grid-cols-3"
          }`}
        >
          <div>
            <h3 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
              {tBrand("name")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("footerBlurb")}
            </p>

            <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
              {t("footerFollow")}
            </p>
            <ul className="mt-2 flex items-center gap-2">
              {SOCIAL_LINKS.map(({ href, labelKey, Icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer me"
                    aria-label={t(labelKey)}
                    className="inline-flex size-9 items-center justify-center rounded-full border border-rose-100/70 bg-white/80 text-rose-700 transition hover:border-rose-200 hover:bg-rose-50"
                  >
                    <Icon className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3">{t("footerDesign")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/venue-designer"
                  className="hover:text-foreground"
                >
                  {t("footerVenueDesigner")}
                </Link>
              </li>
              <li>
                <Link
                  href="/venue-designer/new"
                  className="hover:text-foreground"
                >
                  {t("footerStartNew")}
                </Link>
              </li>
            </ul>
          </div>

          {showBrowse ? (
            <div>
              <h4 className="font-semibold mb-3">{t("footerBrowse")}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/planners" className="hover:text-foreground">
                    {t("footerBrowsePlanners")}
                  </Link>
                </li>
                <li>
                  <Link href="/vendors" className="hover:text-foreground">
                    {t("footerBrowseVendors")}
                  </Link>
                </li>
              </ul>
            </div>
          ) : null}

          <div>
            <h4 className="font-semibold mb-3">{t("footerCompany")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-foreground">
                  {t("footerAbout")}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground">
                  {t("footerContact")}
                </Link>
              </li>
              <li>
                <Link href="/report-bug" className="hover:text-foreground">
                  {t("footerReportBug")}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground">
                  {t("footerPrivacy")}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground">
                  {t("footerTerms")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
          {t("footerCopyright", { year })}
        </div>
      </div>
    </footer>
  );
}
