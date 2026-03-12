"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EVENT_TYPES = [
  "wedding",
  "engagement",
  "birthday",
  "corporate",
  "other",
];

export default function MoodBoardPage() {
  const [style, setStyle] = useState("");
  const [eventType, setEventType] = useState("");
  const [colors, setColors] = useState(["#F5E6D3", "#8B7355", "#C9A86C", "#2C1810", "#E8D5C4"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{
    revisedPrompt: string;
  } | null>(null);

  const handleColorChange = (index: number, value: string) => {
    setColors((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setResult(null);

    // Simulate generation
    await new Promise((r) => setTimeout(r, 2500));

    const revisedPrompt = `A ${eventType || "elegant"} mood board with ${style || "refined"} aesthetic. Color palette: ${colors.join(", ")}. Soft lighting, cohesive styling, editorial quality.`;
    setResult({ revisedPrompt });
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/20">
      <Navbar />
      <main className="flex-1 container mx-auto max-w-2xl px-4 py-12">
        <Card className="border-2 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
              Mood Board Generator
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Describe your vision and we&apos;ll create a personalized mood board.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="style">Style / Aesthetic</Label>
                <Input
                  id="style"
                  placeholder="e.g. Bohemian garden, Modern minimalist..."
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="event-type">Event Type</Label>
                <Select value={eventType} onValueChange={(v) => setEventType(v ?? "")}>
                  <SelectTrigger id="event-type" className="mt-1.5 w-full">
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Color Palette (optional)</Label>
                <div className="mt-1.5 flex gap-2 flex-wrap">
                  {colors.map((color, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => handleColorChange(i, e.target.value)}
                        className="size-10 cursor-pointer rounded-lg border-2 border-muted bg-transparent"
                      />
                      <Input
                        type="text"
                        value={color}
                        onChange={(e) => handleColorChange(i, e.target.value)}
                        className="w-24 h-8 text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-rose-600 to-amber-500 hover:opacity-90"
                disabled={isGenerating}
              >
                {isGenerating ? "Generating..." : "Generate Mood Board"}
              </Button>
            </form>

            <AnimatePresence>
              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-8 overflow-hidden"
                >
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="size-12 rounded-full border-4 border-rose-200 border-t-rose-600"
                    />
                    <p className="text-sm text-muted-foreground">
                      Creating your mood board...
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {result && !isGenerating && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mt-8"
                >
                  <Card className="border bg-muted/30">
                    <CardContent className="pt-6">
                      <div
                        className="aspect-video rounded-lg mb-4 bg-gradient-to-br from-rose-100 via-amber-50 to-rose-200 dark:from-rose-950/50 dark:via-amber-950/30 dark:to-rose-900/50"
                        aria-label="Mood board placeholder"
                      />
                      <p className="text-sm text-muted-foreground font-medium mb-1">
                        Revised prompt
                      </p>
                      <p className="text-sm">{result.revisedPrompt}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
