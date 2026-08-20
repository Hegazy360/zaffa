import Link from "next/link";
import { CheckCircle2, Mail, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Confirmation / failure screen reached via the one-click unsubscribe
 * link in transactional emails. Rendered even when the user isn't signed
 * in, so we keep it minimal and fully static - no DB calls, no auth
 * checks. The actual state flip happens in /api/unsubscribe before we
 * redirect here.
 */
export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const t = await getTranslations("notifications");
  const sp = await searchParams;
  const ok = sp.ok === "1";

  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-rose-50/60 via-background to-background px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="relative w-full max-w-md rounded-3xl border border-brand-line bg-white/85 p-10 text-center shadow-sm backdrop-blur-sm">
        <div className="mb-4 flex justify-center">
          {ok ? (
            <span className="grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <CheckCircle2 className="size-7" />
            </span>
          ) : (
            <span className="grid size-14 place-items-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <XCircle className="size-7" />
            </span>
          )}
        </div>
        <h1 className="font-display text-2xl font-light tracking-tight">
          {ok ? t("unsubscribeConfirmTitle") : t("unsubscribeFailedTitle")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {ok ? t("unsubscribeConfirmBody") : t("unsubscribeFailedBody")}
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/dashboard/notifications/preferences"
            className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Mail className="size-4" />
            {t("settingsTitle")}
          </Link>
          <Link
            href="/"
            className="text-xs text-muted-foreground transition-colors hover:text-rose-700"
          >
            Zaffa
          </Link>
        </div>
      </div>
    </main>
  );
}
