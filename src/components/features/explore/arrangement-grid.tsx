"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrangementCard, type ArrangementItem } from "./arrangement-card";

interface ArrangementGridProps {
  items: ArrangementItem[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: (i = 1) => ({
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.03,
    },
  }),
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut" as const,
    },
  },
};

export function ArrangementGrid({ items }: ArrangementGridProps) {
  return (
    <motion.div
      className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            className="break-inside-avoid mb-4"
            variants={itemVariants}
            layout
          >
            <ArrangementCard item={item} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
