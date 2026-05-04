import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Standard hardening headers applied to every response. CSP intentionally
// allows Stripe (Checkout / hosted fields), Supabase (auth + realtime
// websockets), Cloudinary (image / upload widget), Vercel insights, and
// the configured OpenRouter/AI provider. Tighten before any user input
// makes it into a `<script>` block.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Cameras/mics/geolocation are off by default — enable per-route as
    // those features ship.
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js + analytics need inline + eval; tighten with nonce later.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://va.vercel-scripts.com https://vercel.live",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.stripe.com https://*.supabase.co https://res.cloudinary.com https://images.unsplash.com https://i.pinimg.com https://*.googleusercontent.com https://*.fbcdn.net",
      "media-src 'self' blob: https://res.cloudinary.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.cloudinary.com https://api.openai.com https://openrouter.ai https://api.resend.com https://*.upstash.io https://va.vercel-scripts.com https://vitals.vercel-insights.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.pinimg.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Short, friendly URLs we use in outreach. The `?invitation=<name>` query
  // is preserved automatically by Next's redirect handler so the signup
  // page can pick it up and personalize the welcome.
  async redirects() {
    return [
      {
        source: "/join",
        destination: "/auth/signup/professional",
        permanent: false,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
