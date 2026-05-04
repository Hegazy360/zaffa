"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

// Initialise once on the client. We do this at module load (rather than in
// the provider's useEffect) so the SDK is ready before any captures fire.
if (typeof window !== "undefined") {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
  if (key && !posthog.__loaded) {
    posthog.init(key, {
      api_host: host,
      // Auto pageviews would fire on every render in the App Router because
      // there's no real "page navigation" event — we send pageviews manually
      // from PageviewTracker below using the Next.js router hooks.
      capture_pageview: false,
      capture_pageleave: true,
      person_profiles: "identified_only",
      // Let the SDK auto-record clicks + form interactions for funnels
      // without having to instrument every component. Session replay is
      // off until we explicitly opt in.
      autocapture: true,
      disable_session_recording: true,
    });
  }
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <Provider client={posthog}>
      <PageviewTracker />
      <AuthIdentitySync />
      {children}
    </Provider>
  );
}

function PageviewTracker() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (typeof window === "undefined") return;
    const url = window.location.origin + (pathname ?? "");
    const qs = search?.toString();
    posthog.capture("$pageview", {
      $current_url: qs ? `${url}?${qs}` : url,
    });
  }, [pathname, search]);

  return null;
}

function AuthIdentitySync() {
  // Track whether we've already identified for this session so we can fire
  // `auth.signed_in` exactly once per sign-in (the SIGNED_IN event from
  // Supabase also fires on tab refocus, which would otherwise dupe).
  const [userId, setUserId] = useState<string | null>(null);
  const lastIdentifiedRef =
    typeof window !== "undefined"
      ? (window as unknown as { __zaffaLastIdentified?: string | null })
      : null;

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    const supabase = createClient();

    let mounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const user = data.user;
      if (user) {
        posthog.identify(user.id, {
          email: user.email,
          name: user.user_metadata?.full_name as string | undefined,
        });
        setUserId(user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      if (user) {
        posthog.identify(user.id, {
          email: user.email,
          name: user.user_metadata?.full_name as string | undefined,
        });
        setUserId(user.id);
        // Funnel signal — fired only when the auth event is a real sign-in
        // (SIGNED_IN / TOKEN_REFRESHED) and we haven't already announced
        // this user in this tab.
        if (
          event === "SIGNED_IN" &&
          lastIdentifiedRef &&
          lastIdentifiedRef.__zaffaLastIdentified !== user.id
        ) {
          lastIdentifiedRef.__zaffaLastIdentified = user.id;
          track(ANALYTICS_EVENTS.AUTH_SIGNED_IN);
        }
      } else {
        posthog.reset();
        setUserId(null);
        if (lastIdentifiedRef) lastIdentifiedRef.__zaffaLastIdentified = null;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once we have a user id, fetch the profile and re-set role + locale as
  // person properties so all downstream events are segmentable. We split
  // this into a sibling component so the tRPC hook is only called when
  // it's actually useful (no signed-in user => no query).
  return userId ? <PersonPropertiesSync userId={userId} /> : null;
}

// Pulls role + locale off the user's Profile and sets them as PostHog
// person properties. Only mounts when a user id is known.
function PersonPropertiesSync({ userId }: { userId: string }) {
  const profile = trpc.profile.me.useQuery(undefined, {
    // Profile data is stable for the session; no need to refetch on focus.
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (!profile.data) return;
    posthog.identify(userId, {
      role: profile.data.role,
      locale: profile.data.locale,
    });
  }, [userId, profile.data]);

  return null;
}
