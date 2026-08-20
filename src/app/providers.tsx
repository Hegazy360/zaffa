"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { Suspense, useState } from "react";
import { trpc } from "@/lib/trpc";
import superjson from "superjson";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { isRtlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";
import { ConfirmProvider } from "@/components/ui/confirm";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:3000`;
}

// 4xx tRPC errors are not transient — retrying just multiplies the round-trip
// cost and floods the dev server. We still retry once on 5xx/network errors.
const NON_RETRY_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_SUPPORTED",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "UNPROCESSABLE_CONTENT",
]);

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    const code = error.data?.code as string | undefined;
    if (code && NON_RETRY_CODES.has(code)) return false;
  }
  return failureCount < 1;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // base-ui reads direction from context, not from the DOM's `dir`. Without
  // this provider its positioning and arrow-key logic assume LTR even when
  // <html dir="rtl"> — subtly wrong for our primary locale.
  const locale = useLocale();
  const direction = isRtlLocale(locale) ? "rtl" : "ltr";

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetry,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <DirectionProvider direction={direction}>
          {/* Suspense wraps PostHog because PageviewTracker uses useSearchParams,
            which Next requires to be inside a Suspense boundary. */}
          <Suspense fallback={null}>
            {/* One confirmation dialog, mounted once. `useConfirm()` resolves
                a promise from anywhere in the tree, which is what let the
                eleven `window.confirm` call sites keep their shape. */}
            <ConfirmProvider>
              <PostHogProvider>{children}</PostHogProvider>
            </ConfirmProvider>
          </Suspense>
        </DirectionProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
