"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { suggestEmail } from "@/lib/email-typo";
import { cn } from "@/lib/utils";

/** How long typing has to pause before we second-guess the address. */
const SETTLE_MS = 500;

/**
 * "Did you mean noor@gmail.com?" under an email field, one tap to accept.
 *
 * Only a hint: it never changes the field by itself and never blocks a
 * submit, because a real address we do not recognise must still go
 * through. It waits for typing to pause so it does not flicker through
 * every half-typed domain on the way to `.com`.
 */
export function EmailSuggestion({
  email,
  onApply,
  className,
}: {
  email: string;
  onApply: (next: string) => void;
  className?: string;
}) {
  const t = useTranslations("emailTypo");
  const [settled, setSettled] = useState(email);

  useEffect(() => {
    const id = setTimeout(() => setSettled(email), SETTLE_MS);
    return () => clearTimeout(id);
  }, [email]);

  const suggestion = useMemo(() => suggestEmail(settled), [settled]);
  // Stale while the person is still typing: the field has moved on.
  const visible = suggestion !== null && settled === email;

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn("min-h-0 text-xs text-muted-foreground", !visible && "sr-only", className)}
    >
      {visible
        ? t.rich("didYouMean", {
            email: suggestion,
            fix: (chunks) => (
              <button
                type="button"
                onClick={() => onApply(suggestion)}
                aria-label={t("apply", { email: suggestion })}
                className="inline-flex min-h-11 items-center rounded-sm font-medium text-rose-700 underline underline-offset-4 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 sm:min-h-0"
              >
                <bdi dir="ltr">{chunks}</bdi>
              </button>
            ),
          })
        : null}
    </p>
  );
}
