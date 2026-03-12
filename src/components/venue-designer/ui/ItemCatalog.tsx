"use client";
import { useMemo } from "react";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { ITEM_CATALOG } from "@/types/venue-designer";
import type { ItemType, ItemCatalogEntry } from "@/types/venue-designer";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  tables: "Tables",
  seating: "Seating",
  florals: "Florals",
  lighting: "Lighting",
  decor: "Decor",
  structure: "Structure",
};

const CATEGORY_ORDER = ["tables", "seating", "florals", "lighting", "decor", "structure"];

export function ItemCatalog() {
  const placingType = useVenueDesignerStore((s) => s.placingType);
  const startPlacing = useVenueDesignerStore((s) => s.startPlacing);
  const cancelPlacing = useVenueDesignerStore((s) => s.cancelPlacing);

  const grouped = useMemo(() => {
    const map = new Map<string, ItemCatalogEntry[]>();
    for (const entry of ITEM_CATALOG) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return CATEGORY_ORDER
      .filter((cat) => map.has(cat))
      .map((cat) => ({ category: cat, items: map.get(cat)! }));
  }, []);

  const handleClick = (type: ItemType) => {
    if (placingType === type) {
      cancelPlacing();
    } else {
      startPlacing(type);
    }
  };

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto max-h-full">
      {grouped.map((group) => (
        <div key={group.category}>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-1 mt-2 mb-1">
            {CATEGORY_LABELS[group.category]}
          </h3>
          {group.items.map((entry) => (
            <button
              key={entry.type}
              onClick={() => handleClick(entry.type)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors w-full",
                "hover:bg-accent hover:text-accent-foreground",
                placingType === entry.type &&
                  "bg-rose-100 text-rose-700 ring-1 ring-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-700"
              )}
            >
              <span className="text-base leading-none">{entry.icon}</span>
              <span className="font-medium text-xs">{entry.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
