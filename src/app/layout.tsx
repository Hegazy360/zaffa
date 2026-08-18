import type { Metadata } from "next";
import { Cairo, Fraunces, Inter, Reem_Kufi } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";
import { TikTokPixel } from "@/components/analytics/tiktok-pixel";
import { isRtlLocale } from "@/i18n/config";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

// Arabic display companion to Fraunces. Rendered into a CSS variable so
// globals.css can pick it when [dir="rtl"].
const reemKufi = Reem_Kufi({
  variable: "--font-display-ar",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.zaffa.ai"
  );
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  // Site-wide fallback for pages that don't set their own title. Kept
  // generic — it has to work above a vendor profile and a checkout page as
  // well as the marketing pages — but aligned with the homepage positioning
  // rather than contradicting it, which is what "Your Dream Event, Expertly
  // Planned" was doing while the homepage sold something else entirely.
  title: {
    default: "Zaffa — Your whole wedding, handled",
    template: "%s | Zaffa",
  },
  description:
    "Zaffa handles the whole wedding — we find you the right planner, deal with the back-and-forth, and only send you venues and vendors we'd use ourselves.",
  keywords: [
    "wedding planner",
    "event planning",
    "زفة",
    "wedding",
    "engagement",
  ],
  applicationName: "Zaffa",
  authors: [{ name: "Zaffa" }],
  openGraph: {
    type: "website",
    siteName: "Zaffa",
    title: "Zaffa — Your whole wedding, handled",
    description:
      "Zaffa handles the whole wedding — we find you the right planner, deal with the back-and-forth, and only send you venues and vendors we'd use ourselves.",
    url: siteUrl(),
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Zaffa — Your whole wedding, handled",
    description:
      "We find you the right planner, deal with the back-and-forth, and only send you vendors we'd use ourselves.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <head>
        {/* Catch Supabase recovery links that land with #access_token=...&type=recovery
            on any route and forward them to the dedicated reset-password page,
            preserving the hash so the Supabase client can establish the session. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var h=window.location.hash;if(!h)return;var p=window.location.pathname;if(p==="/auth/reset-password")return;if(h.indexOf("type=recovery")!==-1){window.location.replace("/auth/reset-password"+h);}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${cairo.variable} ${inter.variable} ${fraunces.variable} ${reemKufi.variable} font-sans antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
        <TikTokPixel />
      </body>
    </html>
  );
}
