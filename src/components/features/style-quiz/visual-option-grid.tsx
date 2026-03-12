"use client";

import { motion } from "framer-motion";
import { VisualOptionCard } from "./visual-option-card";

interface ImageOption {
  id: string;
  subcategory: string;
  image_url: string;
  thumbnail_url: string;
  alt_text: string;
}

interface VisualOptionGridProps {
  title: string;
  subtitle?: string;
  options: ImageOption[];
  selectedIds: string[];
  onToggle: (subcategory: string) => void;
  multiSelect?: boolean;
  columns?: 2 | 3 | 4;
  cardSize?: "sm" | "md" | "lg";
}

export function VisualOptionGrid({
  title,
  subtitle,
  options,
  selectedIds,
  onToggle,
  multiSelect = false,
  columns = 3,
  cardSize = "md",
}: VisualOptionGridProps) {
  const deduped = dedupeBySubcategory(options);

  const colsClass = {
    2: "grid-cols-2",
    3: "grid-cols-2 md:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
        {multiSelect && (
          <p className="mt-1 text-xs text-muted-foreground/70">
            Select all that appeal to you
          </p>
        )}
      </div>

      <div className={`grid ${colsClass[columns]} gap-3`}>
        {deduped.map((opt, i) => (
          <motion.div
            key={opt.subcategory}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <VisualOptionCard
              imageUrl={opt.image_url}
              thumbnailUrl={opt.thumbnail_url}
              label={formatLabel(opt.subcategory)}
              selected={selectedIds.includes(opt.subcategory)}
              onSelect={() => onToggle(opt.subcategory)}
              size={cardSize}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function dedupeBySubcategory(options: ImageOption[]): ImageOption[] {
  const seen = new Set<string>();
  return options.filter((o) => {
    if (seen.has(o.subcategory)) return false;
    seen.add(o.subcategory);
    return true;
  });
}

function formatLabel(subcategory: string): string {
  return subcategory
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
