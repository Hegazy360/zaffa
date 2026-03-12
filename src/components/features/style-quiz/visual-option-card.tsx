"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface VisualOptionCardProps {
  imageUrl: string;
  thumbnailUrl?: string;
  label: string;
  selected?: boolean;
  onSelect: () => void;
  size?: "sm" | "md" | "lg";
}

export function VisualOptionCard({
  imageUrl,
  thumbnailUrl,
  label,
  selected = false,
  onSelect,
  size = "md",
}: VisualOptionCardProps) {
  const sizeClasses = {
    sm: "h-32",
    md: "h-44",
    lg: "h-56",
  };

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative block w-full overflow-hidden rounded-xl ring-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-400/50",
        sizeClasses[size],
        selected
          ? "ring-rose-500 shadow-lg shadow-rose-500/20"
          : "ring-transparent hover:ring-rose-300/50"
      )}
    >
      <img
        src={thumbnailUrl ?? imageUrl}
        alt={label}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />

      <div
        className={cn(
          "absolute inset-0 transition-all duration-200",
          selected
            ? "bg-gradient-to-t from-rose-900/70 via-rose-900/20 to-transparent"
            : "bg-gradient-to-t from-black/60 via-black/10 to-transparent hover:from-black/50"
        )}
      />

      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white shadow-md"
        >
          <Check className="h-4 w-4" />
        </motion.div>
      )}

      <span className="absolute bottom-0 left-0 right-0 px-3 py-2.5 text-left text-sm font-semibold text-white drop-shadow-md">
        {label}
      </span>
    </motion.button>
  );
}
