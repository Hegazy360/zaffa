import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function AdminHome() {
  const t = await getTranslations("admin");
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
        {t("eyebrow")}
      </p>
      <h1 className="font-display text-3xl font-light tracking-tight">
        {t("operationsConsole")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("operationsConsoleSubtitle")}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          href="/dashboard/admin/payouts"
          className="rounded-2xl border border-rose-100/70 bg-white/80 p-5 transition hover:border-rose-300 hover:shadow-sm"
        >
          <p className="font-display text-lg font-light tracking-tight">
            {t("plannerPayoutsTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("plannerPayoutsHint")}
          </p>
        </Link>
        <Link
          href="/dashboard/admin/vendor-payouts"
          className="rounded-2xl border border-rose-100/70 bg-white/80 p-5 transition hover:border-rose-300 hover:shadow-sm"
        >
          <p className="font-display text-lg font-light tracking-tight">
            {t("vendorPayoutsTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("vendorPayoutsHint")}
          </p>
        </Link>
      </div>
    </div>
  );
}
