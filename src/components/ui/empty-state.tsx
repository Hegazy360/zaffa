import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "there is nothing here yet" panel.
 *
 * Empty states were hand-rolled 38 times, and they had drifted into two
 * different jobs: some explain and invite, most just say "No results". The
 * first empty state a couple sees is often the first thing the product says
 * to them unprompted, so the shape here forces the useful version — a reason
 * and a way forward, not a shrug.
 *
 * `action` is deliberately a node rather than a label/href pair: about half
 * the real cases open a dialog or fire a mutation rather than navigate.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  /** What to do about it. Omit only when there is genuinely nothing to do. */
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-plate border border-dashed border-brand-line bg-brand-tint/40 px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-background text-brand shadow-glow-sm">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <h3 className="font-display text-lg font-light tracking-tight text-balance">
        {title}
      </h3>
      {description && (
        <p className="mt-2 max-w-sm text-pretty text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
