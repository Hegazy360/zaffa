import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * The designer gallery's shape, before the designs.
 *
 * Same reasoning as the client dashboard: six cards in a three-up grid, so the
 * page does not jump when the real ones arrive.
 */
export default async function VenueDesignerLoading() {
  const t = await getTranslations("common");

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <SkeletonRegion label={t("loading")} className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl ring-1 ring-foreground/[0.06]"
            >
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="space-y-2.5 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}
