"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Returns the visitor's `is_anonymous` flag (or null while resolving).
 *
 * Resolves locally from the Supabase JWT claims (no network round
 * trip — claims are verified against the project's cached JWK). Used
 * by client components that need to render anonymous-specific affordances
 * like the Cloudflare Turnstile widget on the Generate panel.
 */
export function useIsAnonymous(): boolean | null {
  const [value, setValue] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    void supabase.auth.getClaims().then(({ data }) => {
      if (!mounted) return;
      const claims = data?.claims as { is_anonymous?: boolean } | undefined;
      setValue(claims?.is_anonymous === true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user as { is_anonymous?: boolean } | undefined;
      if (!u) {
        setValue(null);
        return;
      }
      setValue(u.is_anonymous === true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return value;
}
