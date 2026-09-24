"use client";

import { useState } from "react";
import { CompareSlider } from "@/components/ui/compare-slider";
import { cn } from "@/lib/utils";

// The client island of the "Your venue, dressed" homepage section: two
// before/after examples behind a small switch. Kept to the slider and the
// switch so the section around it stays a server component, and it imports
// nothing from tRPC or the designer, so the homepage bundle only gains the
// slider itself.

export interface VenueExample {
  id: string;
  tab: string;
  before: { src: string; alt: string };
  after: { src: string; alt: string };
  width: number;
  height: number;
}

export function VenueDressedExamples({
  examples,
  tabsLabel,
  beforeLabel,
  afterLabel,
  compareLabel,
}: {
  examples: VenueExample[];
  tabsLabel: string;
  beforeLabel: string;
  afterLabel: string;
  compareLabel: string;
}) {
  const [activeId, setActiveId] = useState(examples[0]?.id);
  const active = examples.find((e) => e.id === activeId) ?? examples[0];
  if (!active) return null;

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label={tabsLabel}
        className="mx-auto flex w-fit gap-1 rounded-full border border-brand-line bg-white/80 p-1 shadow-sm backdrop-blur-sm"
      >
        {examples.map((example) => (
          <button
            key={example.id}
            type="button"
            aria-pressed={example.id === active.id}
            data-venue-example={example.id}
            onClick={() => setActiveId(example.id)}
            className={cn(
              "h-11 rounded-full px-5 text-sm font-medium transition-colors sm:h-9",
              example.id === active.id
                ? "bg-rose-600 text-white shadow-sm"
                : "text-muted-foreground hover:bg-rose-50 hover:text-foreground",
            )}
          >
            {example.tab}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-line shadow-glow-lg ring-1 ring-foreground/[0.04]">
        {/* Keyed by example so switching starts the divider at 50% again
            rather than wherever the last one was left. */}
        <CompareSlider
          key={active.id}
          before={active.before}
          after={active.after}
          width={active.width}
          height={active.height}
          sizes="hero"
          beforeLabel={beforeLabel}
          afterLabel={afterLabel}
          label={compareLabel}
        />
      </div>
    </div>
  );
}
