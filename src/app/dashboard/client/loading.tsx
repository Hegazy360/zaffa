import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * The dashboard's shape, before the dashboard.
 *
 * Without this the route fell through to the root `loading.tsx` — a spinner in
 * the middle of an otherwise empty screen — and then jumped into a two-section
 * layout when the payload arrived. A skeleton that matches the real grid means
 * nothing moves when the content lands, which is the whole point; a generic
 * grey box would be a spinner with extra steps.
 */
export default async function DashboardClientLoading() {
  const t = await getTranslations("common");

  return (
    <SkeletonRegion label={t("loading")} className="space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <section className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl ring-1 ring-foreground/[0.06]"
            >
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      </section>
    </SkeletonRegion>
  );
}
