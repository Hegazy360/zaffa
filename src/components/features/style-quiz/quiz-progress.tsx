"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  Palette,
  Flower2,
  UtensilsCrossed,
  Lightbulb,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuizCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  totalSteps: number;
}

export const QUIZ_CATEGORIES: QuizCategory[] = [
  { id: "vibe", label: "Vibe", icon: Sparkles, totalSteps: 1 },
  { id: "palette", label: "Colors", icon: Palette, totalSteps: 1 },
  { id: "flowers", label: "Flowers", icon: Flower2, totalSteps: 4 },
  { id: "tables", label: "Tables", icon: UtensilsCrossed, totalSteps: 2 },
  { id: "lighting", label: "Lighting", icon: Lightbulb, totalSteps: 1 },
  { id: "venue_decor", label: "Venue", icon: Building2, totalSteps: 1 },
];

interface QuizProgressProps {
  currentCategoryIndex: number;
  currentSubStep: number;
}

export function QuizProgress({
  currentCategoryIndex,
  currentSubStep,
}: QuizProgressProps) {
  const totalSteps = QUIZ_CATEGORIES.reduce((sum, c) => sum + c.totalSteps, 0);
  let completedSteps = 0;
  for (let i = 0; i < currentCategoryIndex; i++) {
    completedSteps += QUIZ_CATEGORIES[i].totalSteps;
  }
  completedSteps += currentSubStep;
  const progress = (completedSteps / totalSteps) * 100;

  return (
    <div className="mb-8">
      {/* Progress bar */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Category indicators */}
      <div className="mt-4 flex justify-between gap-1">
        {QUIZ_CATEGORIES.map((cat, i) => {
          const Icon = cat.icon;
          const isActive = i === currentCategoryIndex;
          const isComplete = i < currentCategoryIndex;

          return (
            <div
              key={cat.id}
              className={cn(
                "flex flex-col items-center gap-1 transition-colors",
                isActive
                  ? "text-rose-500"
                  : isComplete
                    ? "text-rose-400"
                    : "text-muted-foreground/40"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                  isActive
                    ? "bg-rose-100 ring-2 ring-rose-500 dark:bg-rose-900/40"
                    : isComplete
                      ? "bg-rose-100/60 dark:bg-rose-900/20"
                      : "bg-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="hidden text-[10px] font-medium sm:block">
                {cat.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
