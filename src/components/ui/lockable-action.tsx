"use client";

import { cn } from "@/lib/utils";

/**
 * Wraps a disabled action with a hover-revealed hint tooltip.
 *
 * The base `Button` primitive applies `disabled:pointer-events-none` in
 * its Tailwind variant, which kills hover events on the button - so a
 * native `title=""` attribute never fires for disabled controls (and
 * doesn't surface on touch devices regardless). This wrapper uses a
 * tiny CSS tooltip driven by `group-hover/locked`: the parent span
 * isn't disabled, so it receives `:hover` even when `pointer-events`
 * pass through the disabled child.
 *
 * `align` controls horizontal anchoring relative to the wrapped child:
 *   - "start" (default): tooltip extends toward inline-end, best for
 *     buttons at the inline-start edge of their row, where a centered
 *     tooltip would overflow the container.
 *   - "end": tooltip extends toward inline-start, best for buttons in
 *     a right-aligned cluster (e.g. action rows with `ms-auto`).
 *
 * Touch users and screen readers should still be served by an inline
 * hint paragraph + `aria-label` on the disabled control; this is
 * desktop polish, not the primary accessibility surface.
 */
export function LockableAction({
  locked,
  hint,
  align = "start",
  children,
}: {
  locked: boolean;
  hint: string;
  align?: "start" | "end";
  children: React.ReactNode;
}) {
  if (!locked) return <>{children}</>;
  const positionClass =
    align === "end" ? "end-0" : "start-0";
  return (
    <span className="group/locked relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full z-50 mb-2 w-max max-w-[16rem] rounded-md bg-foreground/95 px-2.5 py-1.5 text-start text-xs leading-snug text-background opacity-0 shadow-md transition-opacity duration-150 group-hover/locked:opacity-100",
          positionClass,
        )}
      >
        {hint}
      </span>
    </span>
  );
}
