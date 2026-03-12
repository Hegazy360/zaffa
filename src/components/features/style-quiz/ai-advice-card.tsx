"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AiAdviceCardProps {
  advice: string | null;
  loading?: boolean;
  onContinue: () => void;
}

export function AiAdviceCard({
  advice,
  loading = false,
  onContinue,
}: AiAdviceCardProps) {
  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex items-center gap-3 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-amber-50 p-5 dark:border-rose-800/50 dark:from-rose-950/40 dark:to-amber-950/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/50">
            <Sparkles className="h-4 w-4 animate-pulse text-rose-500" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-rose-200/50 dark:bg-rose-800/30" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-rose-200/50 dark:bg-rose-800/30" />
          </div>
        </motion.div>
      ) : advice ? (
        <motion.div
          key="advice"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-amber-50 p-5 dark:border-rose-800/50 dark:from-rose-950/40 dark:to-amber-950/40"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/50">
              <Sparkles className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">
              AI Style Tip
            </span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            {advice}
          </p>
          <Button
            onClick={onContinue}
            size="sm"
            className="gap-1.5 bg-rose-600 hover:bg-rose-700"
          >
            Continue
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
