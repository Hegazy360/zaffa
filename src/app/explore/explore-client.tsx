"use client";

import { useState, useMemo } from "react";
import { FilterBar, type ExploreFilters } from "@/components/features/explore/filter-bar";
import { ArrangementGrid } from "@/components/features/explore/arrangement-grid";
import type { ArrangementItem } from "@/components/features/explore/arrangement-card";

interface ExplorePageClientProps {
  initialItems: ArrangementItem[];
}

export function ExplorePageClient({ initialItems }: ExplorePageClientProps) {
  const [filters, setFilters] = useState<ExploreFilters>({});

  const filteredItems = useMemo(() => {
    return initialItems.filter((item) => {
      if (filters.eventType && item.event_type !== filters.eventType) {
        return false;
      }
      if (
        filters.style &&
        !item.style_tags.some(
          (tag) => tag.toLowerCase() === filters.style?.toLowerCase()
        )
      ) {
        return false;
      }
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesCaption = item.caption?.toLowerCase().includes(search);
        const matchesEventType = item.event_type?.toLowerCase().includes(search);
        const matchesStyle = item.style_tags.some((tag) =>
          tag.toLowerCase().includes(search)
        );
        if (!matchesCaption && !matchesEventType && !matchesStyle) {
          return false;
        }
      }
      return true;
    });
  }, [initialItems, filters]);

  return (
    <div className="space-y-8">
      <FilterBar filters={filters} onFilterChange={setFilters} />
      <ArrangementGrid items={filteredItems} />
    </div>
  );
}
