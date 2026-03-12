"use client";

import { motion } from "framer-motion";
import { Sparkles, Flower2, UtensilsCrossed, Lightbulb, Building2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface StyleResult {
  style_name: string;
  summary: string;
  palette: string[];
  vibe_description: string;
  flowers: { types: string[]; arrangement_tip: string };
  table_design: { style: string; centerpiece_tip: string };
  lighting: { types: string[]; ambiance_tip: string };
  venue_decor: { elements: string[]; styling_tip: string };
  pro_tips: string[];
}

interface QuizResultProps {
  result: StyleResult;
  onRestart: () => void;
}

export function QuizResult({ result, onRestart }: QuizResultProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-400"
        >
          <Sparkles className="h-7 w-7 text-white" />
        </motion.div>
        <h2 className="text-3xl font-bold tracking-tight">
          {result.style_name}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-muted-foreground leading-relaxed">
          {result.summary}
        </p>
      </div>

      {/* Color Palette */}
      <Section title="Your Color Palette">
        <div className="flex gap-2 justify-center flex-wrap">
          {result.palette.map((color) => (
            <motion.div
              key={color}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring" }}
              className="flex flex-col items-center gap-1.5"
            >
              <div
                className="h-16 w-16 rounded-xl shadow-md ring-1 ring-black/5"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] font-mono text-muted-foreground">
                {color}
              </span>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Vibe */}
      {result.vibe_description && (
        <Section title="Overall Vibe">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.vibe_description}
          </p>
        </Section>
      )}

      {/* Flowers */}
      <Section title="Flowers & Greenery" icon={Flower2}>
        <div className="flex flex-wrap gap-2 mb-3">
          {result.flowers.types.map((f) => (
            <Badge key={f} variant="secondary">{f}</Badge>
          ))}
        </div>
        {result.flowers.arrangement_tip && (
          <p className="text-sm text-muted-foreground italic">
            {result.flowers.arrangement_tip}
          </p>
        )}
      </Section>

      {/* Table Design */}
      <Section title="Table Design" icon={UtensilsCrossed}>
        <p className="text-sm font-medium mb-1">{result.table_design.style}</p>
        {result.table_design.centerpiece_tip && (
          <p className="text-sm text-muted-foreground italic">
            {result.table_design.centerpiece_tip}
          </p>
        )}
      </Section>

      {/* Lighting */}
      <Section title="Lighting & Ambiance" icon={Lightbulb}>
        <div className="flex flex-wrap gap-2 mb-3">
          {result.lighting.types.map((l) => (
            <Badge key={l} variant="secondary">{l}</Badge>
          ))}
        </div>
        {result.lighting.ambiance_tip && (
          <p className="text-sm text-muted-foreground italic">
            {result.lighting.ambiance_tip}
          </p>
        )}
      </Section>

      {/* Venue Decor */}
      <Section title="Venue Decoration" icon={Building2}>
        <div className="flex flex-wrap gap-2 mb-3">
          {result.venue_decor.elements.map((e) => (
            <Badge key={e} variant="secondary">{e}</Badge>
          ))}
        </div>
        {result.venue_decor.styling_tip && (
          <p className="text-sm text-muted-foreground italic">
            {result.venue_decor.styling_tip}
          </p>
        )}
      </Section>

      {/* Pro Tips */}
      {result.pro_tips && result.pro_tips.length > 0 && (
        <Section title="Pro Tips">
          <ul className="space-y-2">
            {result.pro_tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Restart */}
      <div className="pt-4 text-center">
        <Button variant="outline" onClick={onRestart} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Take Quiz Again
        </Button>
      </div>
    </motion.div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-rose-500" />}
        <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
          {title}
        </h3>
      </div>
      {children}
    </motion.div>
  );
}
