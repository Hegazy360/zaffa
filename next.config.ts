import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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
    ],
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
