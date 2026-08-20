import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Standard hardening headers applied to every response. CSP intentionally
// allows Stripe (Checkout / hosted fields), Supabase (auth + realtime
// websockets), Cloudinary (image / upload widget), Vercel insights,
// PostHog (product analytics, EU region), TikTok Pixel (ad attribution),
// and the configured OpenRouter/AI provider. Tighten before any user input
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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://va.vercel-scripts.com https://vercel.live https://*.i.posthog.com https://analytics.tiktok.com",
      // Libraries (PostHog, Sentry replay, etc.) spin up Web Workers from
      // Blob URLs to keep heavy work off the main thread. Without an
      // explicit worker-src, browsers fall back to script-src, which
      // doesn't allow `blob:` and would block the worker.
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // i.pinimg.com is back, and it is not the hotlink ZAF-46 removed.
      // That one was a decorative photo on the sign-in page — somebody else's
      // image, used as our own. This is the Pinterest reference *search*: the
      // designer's inspiration board and reference picker display search
      // results, which is the feature working as intended. Removing the host
      // from the CSP blocked those thumbnails in production; removing it from
      // `remotePatterns` was correct and stays, because these are arbitrary
      // third-party URLs that must not go through our image optimizer.
      "img-src 'self' data: blob: https://*.stripe.com https://*.supabase.co https://res.cloudinary.com https://images.unsplash.com https://i.pinimg.com https://*.googleusercontent.com https://*.fbcdn.net https://*.i.posthog.com https://analytics.tiktok.com",
      "media-src 'self' blob: https://res.cloudinary.com",
      // `data:` is required by `html-to-image` (used by the admin post
      // rasterizer): it walks the DOM and re-fetches embedded images,
      // some of which we pre-inline as data URLs. `data:` is an inline
      // scheme — no remote endpoint, no exfiltration risk.
      "connect-src 'self' data: https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.cloudinary.com https://api.openai.com https://openrouter.ai https://api.resend.com https://*.upstash.io https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.i.posthog.com https://analytics.tiktok.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // The OG cards read their fonts off disk with `fs.readFile`, which Next's
  // tracer cannot follow through `path.join(process.cwd(), ...)`. Without this
  // the files are pruned from the deployment and every share card 500s in
  // production while working perfectly in dev — the worst possible failure
  // shape for a growth surface nobody looks at directly.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./src/assets/fonts/**"],
    "/r/[renderId]/opengraph-image": ["./src/assets/fonts/**"],
    "/v/[slug]/opengraph-image": ["./src/assets/fonts/**"],
    // The lookbook inlines its fonts from disk for the same reason, and its
    // failure mode is worse: a missing Arabic face in a paid PDF is tofu, not
    // a fallback.
    "/api/vision-pack/[packId]/lookbook": ["./src/assets/fonts/**"],
  },
  images: {
    remotePatterns: [
      {
        // Still here only for `scripts/seed-vision-pack-gallery.ts`, whose
        // fictional demo packs are illustrated with stock photography. No
        // shipped surface loads an Unsplash URL any more (ZAF-45 removed the
        // last of them from the hero), so this pattern goes when that seed
        // data is replaced with real Zaffa renders.
        protocol: "https",
        hostname: "images.unsplash.com",
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
      // Canonicalize the apex domain to www — done here, excluding
      // `/api/*`, instead of as a platform-level Vercel domain redirect.
      // Vercel Cron invokes cron paths directly and does not follow
      // redirects (a redirected response doesn't even show up in the
      // function invocation logs), so a domain-wide redirect on zaffa.ai
      // was silently swallowing every cron invocation — the cleanup-anon-
      // users cron hadn't run since the anon-render feature shipped.
      // Requires disabling the automatic redirect on the zaffa.ai domain
      // in Vercel's dashboard (Settings → Domains) so this one takes over.
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "zaffa.ai" }],
        destination: "https://www.zaffa.ai/:path",
        permanent: false,
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "zaffa",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
