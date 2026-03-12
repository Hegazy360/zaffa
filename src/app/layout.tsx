import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
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
      <body
        className={`${cairo.variable} ${inter.variable} font-sans antialiased`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
