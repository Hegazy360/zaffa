import { cn } from "@/lib/utils";

/**
 * A placeholder shaped like the thing that is loading.
 *
 * The point of a skeleton is not decoration: it reserves the layout so the
 * page does not jump when content arrives, and it tells the reader *what* is
 * coming. A spinner says "wait"; a skeleton says "your designs are loading,
 * there are about six of them, in a grid". Only useful when it matches the
 * real layout — a generic grey box is a spinner with extra steps.
 *
 * `animate-pulse` is deliberate: `globals.css` exempts `.animate-pulse` and
 * `.animate-spin` from the reduced-motion reset, because freezing a loading
 * indicator makes a working page look broken.
 */
export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-foreground/[0.06]", className)}
      {...props}
    />
  );
}

/**
 * Wraps a skeleton region so assistive tech announces "loading" once, rather
 * than reading out a screenful of empty boxes.
 */
export function SkeletonRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}
