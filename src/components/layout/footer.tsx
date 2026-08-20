import Link from "next/link";
import { Instagram } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { isFlagEnabled } from "@/lib/flags";
import {
  WHATSAPP_LINK,
  WHATSAPP_NUMBER_DISPLAY,
} from "@/lib/contact-channels";

// Lucide doesn't ship TikTok or WhatsApp brand glyphs, so we render
// inline SVGs. Kept here (not in `components/icons/`) because each has
// exactly one consumer and inlining keeps the bundle one less import
// deep. Path data uses `currentColor` so the icon inherits text colour
// like every other footer icon.
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

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Zm-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.83 9.83 0 0 1 6.991 2.898 9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884Zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488Z" />
    </svg>
  );
}

interface SocialLink {
  href: string;
  labelKey:
    | "footerSocialInstagram"
    | "footerSocialTiktok"
    | "footerSocialWhatsapp";
  Icon: React.ComponentType<{ className?: string }>;
  /**
   * Append the formatted phone number to the aria-label. WhatsApp benefits
   * from a more descriptive label so screen-reader users hear the number
   * before tapping; for IG / TikTok the channel name alone is enough.
   */
  ariaSuffix?: string;
}

// Single source of truth for the social icons rendered next to the
// copyright. Instagram and TikTok point at the `zaffa.ai` handle;
// WhatsApp opens the business chat with the number defined in
// `contact-channels.ts`.
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
  {
    href: WHATSAPP_LINK,
    labelKey: "footerSocialWhatsapp",
    Icon: WhatsAppIcon,
    ariaSuffix: WHATSAPP_NUMBER_DISPLAY,
  },
];

export async function Footer() {
  const t = await getTranslations("marketing");
  const tBrand = await getTranslations("brand");
  const year = new Date().getFullYear();
  const showBrowse = isFlagEnabled("publicBrowse");
  const showPricing = isFlagEnabled("publishedPricing");

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto max-w-7xl px-4 py-12">
        <div
          className={`grid grid-cols-1 gap-8 ${
            showBrowse ? "md:grid-cols-4" : "md:grid-cols-3"
          }`}
        >
          <div>
            <h3 className="text-lg font-bold bg-brand-gradient bg-clip-text text-transparent">
              {tBrand("name")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("footerBlurb")}
            </p>

            <p className="mt-5 text-eyebrow font-medium text-muted-foreground/80">
              {t("footerFollow")}
            </p>
            <ul className="mt-2 flex items-center gap-2">
              {SOCIAL_LINKS.map(({ href, labelKey, Icon, ariaSuffix }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer me"
                    aria-label={
                      ariaSuffix ? `${t(labelKey)} — ${ariaSuffix}` : t(labelKey)
                    }
                    className="inline-flex size-9 items-center justify-center rounded-full border border-brand-line bg-white/80 text-rose-700 transition hover:border-rose-200 hover:bg-rose-50"
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
              {showPricing && (
                <li>
                  <Link href="/pricing" className="hover:text-foreground">
                    {t("footerPricing")}
                  </Link>
                </li>
              )}
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
