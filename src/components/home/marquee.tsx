"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MarqueeProps {
  children: ReactNode;
  reverse?: boolean;
  speed?: number;
  className?: string;
  pauseOnHover?: boolean;
}

export function Marquee({
  children,
  reverse = false,
  speed = 40,
  className,
  pauseOnHover = true,
}: MarqueeProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden mask-fade-x",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-max gap-12 will-change-transform",
          reverse ? "marquee-track-reverse" : "marquee-track",
          pauseOnHover && "group-hover:[animation-play-state:paused]",
        )}
        style={{ "--marquee-duration": `${speed}s` } as React.CSSProperties}
      >
        <div className="flex shrink-0 items-center gap-12">{children}</div>
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center gap-12"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
