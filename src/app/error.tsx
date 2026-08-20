"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Surface the error to whatever observability tooling is wired into
  // window in production. We deliberately do NOT show `error.message`
  // to the user, server messages can leak query fragments / stack
  // traces that aren't safe for an unauthenticated viewer. Show the
  // Next.js `digest` (an opaque id) instead so support can correlate.
  const t = useTranslations("errors");
  useEffect(() => {
    if (typeof console !== "undefined") {
      console.error("[ui] unhandled boundary", error);
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold mb-2">{t("title")}</h2>
        <p className="text-muted-foreground mb-2">{t("body")}</p>
        {error.digest && (
          <p className="mb-6 font-mono text-xs text-muted-foreground">
            {t("reference", { id: error.digest })}
          </p>
        )}
        <Button onClick={reset}>{t("tryAgain")}</Button>
      </div>
    </div>
  );
}
