import type { Metadata } from "next";
import { Cairo, Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";

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

export const metadata: Metadata = {
  title: {
    default: "Zaffa — Your Dream Event, Expertly Planned",
    template: "%s | Zaffa",
  },
  description:
    "Connect with Egypt's finest wedding planners and vendors. AI-powered style matching, mood boards, and seamless event planning.",
  keywords: [
    "wedding planner",
    "Egypt",
    "event planning",
    "زفة",
    "wedding",
    "engagement",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
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
        className={`${cairo.variable} ${inter.variable} ${fraunces.variable} font-sans antialiased`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
