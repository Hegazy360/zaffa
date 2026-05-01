import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function Footer() {
  const t = await getTranslations("marketing");
  const tBrand = await getTranslations("brand");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
              {tBrand("name")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("footerBlurb")}
            </p>
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
                <Link href="/privacy" className="hover:text-foreground">
                  {t("footerPrivacy")}
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
