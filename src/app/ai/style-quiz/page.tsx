"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

import { QuizProgress, QUIZ_CATEGORIES } from "@/components/features/style-quiz/quiz-progress";
import { VisualOptionGrid } from "@/components/features/style-quiz/visual-option-grid";
import { PalettePicker } from "@/components/features/style-quiz/palette-picker";
import { AiAdviceCard } from "@/components/features/style-quiz/ai-advice-card";
import { QuizResult, type StyleResult } from "@/components/features/style-quiz/quiz-result";
import { FALLBACK_IMAGES } from "@/lib/quiz-fallback-images";

interface Selections {
  vibe: string[];
  palette: string[];
  flower_types: string[];
  bouquet: string[];
  table_florals: string[];
  ceremony_flowers: string[];
  table_style: string[];
  table_centerpiece: string[];
  lighting: string[];
  venue_decor: string[];
}

const EMPTY_SELECTIONS: Selections = {
  vibe: [],
  palette: [],
  flower_types: [],
  bouquet: [],
  table_florals: [],
  ceremony_flowers: [],
  table_style: [],
  table_centerpiece: [],
  lighting: [],
  venue_decor: [],
};

interface StepDef {
  categoryIndex: number;
  subStep: number;
  key: string;
  selectionKey: keyof Selections;
  dbCategory?: "overall_vibe" | "flowers" | "tables" | "lighting" | "venue_decor";
  dbSubcategory?: string;
  title: string;
  subtitle?: string;
  type: "visual" | "palette";
  multiSelect?: boolean;
  columns?: 2 | 3 | 4;
  cardSize?: "sm" | "md" | "lg";
}

const STEPS: StepDef[] = [
  {
    categoryIndex: 0, subStep: 0, key: "vibe",
    selectionKey: "vibe", dbCategory: "overall_vibe",
    title: "What's Your Vibe?",
    subtitle: "Choose the overall style that speaks to you",
    type: "visual", columns: 4, cardSize: "lg",
  },
  {
    categoryIndex: 1, subStep: 0, key: "palette",
    selectionKey: "palette",
    title: "Color Palette",
    subtitle: "AI-suggested palettes based on your vibe",
    type: "palette",
  },
  {
    categoryIndex: 2, subStep: 0, key: "flower_types",
    selectionKey: "flower_types", dbCategory: "flowers",
    title: "Flower Types",
    subtitle: "What flowers catch your eye?",
    type: "visual", multiSelect: true, columns: 3, cardSize: "md",
  },
  {
    categoryIndex: 2, subStep: 1, key: "bouquet",
    selectionKey: "bouquet", dbCategory: "flowers",
    title: "Bridal Bouquet",
    subtitle: "How do you envision your bouquet?",
    type: "visual", columns: 2, cardSize: "lg",
  },
  {
    categoryIndex: 2, subStep: 2, key: "table_florals",
    selectionKey: "table_florals", dbCategory: "flowers",
    title: "Table Florals",
    subtitle: "How should flowers appear on the tables?",
    type: "visual", multiSelect: true, columns: 3, cardSize: "md",
  },
  {
    categoryIndex: 2, subStep: 3, key: "ceremony_flowers",
    selectionKey: "ceremony_flowers", dbCategory: "flowers",
    title: "Ceremony Flowers",
    subtitle: "How should the ceremony space be framed?",
    type: "visual", multiSelect: true, columns: 3, cardSize: "md",
  },
  {
    categoryIndex: 3, subStep: 0, key: "table_style",
    selectionKey: "table_style", dbCategory: "tables",
    title: "Table Setting",
    subtitle: "Pick your table style",
    type: "visual", columns: 2, cardSize: "lg",
  },
  {
    categoryIndex: 3, subStep: 1, key: "table_centerpiece",
    selectionKey: "table_centerpiece", dbCategory: "tables",
    title: "Centerpieces & Details",
    subtitle: "What should be the focal point of your tables?",
    type: "visual", multiSelect: true, columns: 4, cardSize: "md",
  },
  {
    categoryIndex: 4, subStep: 0, key: "lighting",
    selectionKey: "lighting", dbCategory: "lighting",
    title: "Lighting & Ambiance",
    subtitle: "Set the mood with the right lighting",
    type: "visual", multiSelect: true, columns: 4, cardSize: "md",
  },
  {
    categoryIndex: 5, subStep: 0, key: "venue_decor",
    selectionKey: "venue_decor", dbCategory: "venue_decor",
    title: "Venue Decoration",
    subtitle: "The finishing touches for your space",
    type: "visual", multiSelect: true, columns: 3, cardSize: "lg",
  },
];

const FLOWER_TYPE_SUBCATS = ["roses", "peonies", "orchids", "wildflowers", "lilies", "protea"];
const BOUQUET_SUBCATS = ["cascading_bouquet", "round_bouquet"];
const TABLE_FLORAL_SUBCATS = ["centerpiece", "garland"];
const CEREMONY_FLOWER_SUBCATS = ["arch", "aisle_petals", "altar_flowers"];
const TABLE_STYLE_SUBCATS = ["formal", "casual", "family_style", "sweetheart"];
const TABLE_CENTER_SUBCATS = ["candelabra", "floral_low", "floral_tall", "lanterns"];

export default function StyleQuizPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [selections, setSelections] = useState<Selections>({ ...EMPTY_SELECTIONS });
  const [showAdvice, setShowAdvice] = useState(false);
  const [result, setResult] = useState<StyleResult | null>(null);
  const [palettes, setPalettes] = useState<{ id: string; name: string; colors: string[] }[]>([]);

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  // Fetch images for the current visual step
  const imagesQuery = trpc.inspiration.byCategory.useQuery(
    { category: currentStep.dbCategory! },
    { enabled: currentStep.type === "visual" && !!currentStep.dbCategory }
  );

  // AI step advice
  const adviceMutation = trpc.ai.stepAdvice.useMutation();

  // AI palette suggestions
  const paletteMutation = trpc.ai.paletteSuggestions.useMutation({
    onSuccess: (data) => setPalettes(data),
  });

  // Final result
  const resultMutation = trpc.ai.styleQuiz.useMutation({
    onSuccess: (data) => setResult(data as StyleResult),
  });

  // Trigger palette generation when entering palette step
  useEffect(() => {
    if (currentStep.type === "palette" && palettes.length === 0 && selections.vibe.length > 0) {
      paletteMutation.mutate({ vibe: selections.vibe });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const filteredImages = useCallback(() => {
    const dbImages = imagesQuery.data ?? [];
    const step = currentStep;
    let subcats: string[] | undefined;

    if (step.key === "flower_types") subcats = FLOWER_TYPE_SUBCATS;
    else if (step.key === "bouquet") subcats = BOUQUET_SUBCATS;
    else if (step.key === "table_florals") subcats = TABLE_FLORAL_SUBCATS;
    else if (step.key === "ceremony_flowers") subcats = CEREMONY_FLOWER_SUBCATS;
    else if (step.key === "table_style") subcats = TABLE_STYLE_SUBCATS;
    else if (step.key === "table_centerpiece") subcats = TABLE_CENTER_SUBCATS;

    let result = dbImages;
    if (subcats) {
      result = dbImages.filter((img) => subcats!.includes(img.subcategory));
    }

    // Fall back to static images if DB is empty
    if (result.length === 0 && step.dbCategory) {
      const fallback = FALLBACK_IMAGES[step.dbCategory] ?? [];
      if (subcats) {
        return fallback.filter((img) => subcats!.includes(img.subcategory));
      }
      return fallback;
    }

    return result;
  }, [imagesQuery.data, currentStep]);

  const handleVisualToggle = useCallback(
    (subcategory: string) => {
      const key = currentStep.selectionKey;
      setSelections((prev) => {
        const current = prev[key];
        if (currentStep.multiSelect) {
          const next = current.includes(subcategory)
            ? current.filter((s) => s !== subcategory)
            : [...current, subcategory];
          return { ...prev, [key]: next };
        }
        return { ...prev, [key]: [subcategory] };
      });
    },
    [currentStep]
  );

  const handlePaletteSelect = useCallback(
    (paletteId: string) => {
      const palette = palettes.find((p) => p.id === paletteId);
      if (palette) {
        setSelections((prev) => ({ ...prev, palette: palette.colors }));
      }
    },
    [palettes]
  );

  const canAdvance = () => {
    const sel = selections[currentStep.selectionKey];
    return sel.length > 0;
  };

  const goNext = useCallback(() => {
    if (showAdvice) {
      setShowAdvice(false);
      if (isLastStep) {
        resultMutation.mutate({ selections });
      } else {
        setStepIndex((i) => i + 1);
      }
      return;
    }

    // Check if we're at the end of a category (show AI advice)
    const nextStep = STEPS[stepIndex + 1];
    const isEndOfCategory =
      isLastStep || (nextStep && nextStep.categoryIndex !== currentStep.categoryIndex);

    if (isEndOfCategory) {
      setShowAdvice(true);
      adviceMutation.mutate({
        currentCategory: QUIZ_CATEGORIES[currentStep.categoryIndex].label,
        selectionsSoFar: selections,
      });
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [showAdvice, isLastStep, stepIndex, currentStep, selections, adviceMutation, resultMutation]);

  const goBack = useCallback(() => {
    if (showAdvice) {
      setShowAdvice(false);
      return;
    }
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    }
  }, [showAdvice, stepIndex]);

  const handleRestart = useCallback(() => {
    setStepIndex(0);
    setSelections({ ...EMPTY_SELECTIONS });
    setShowAdvice(false);
    setResult(null);
    setPalettes([]);
    resultMutation.reset();
    paletteMutation.reset();
    adviceMutation.reset();
  }, [resultMutation, paletteMutation, adviceMutation]);

  // Determine what to render
  const showResult = resultMutation.isSuccess && result;
  const showLoading = resultMutation.isPending;
  const showError = resultMutation.isError;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/20">
      <Navbar />
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-8">
        {!showResult && !showLoading && !showError && (
          <QuizProgress
            currentCategoryIndex={currentStep.categoryIndex}
            currentSubStep={currentStep.subStep}
          />
        )}

        <AnimatePresence mode="wait">
          {showLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="border-2 shadow-lg">
                <CardContent className="py-20 flex flex-col items-center gap-4 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-rose-500" />
                  <div>
                    <h3 className="text-xl font-semibold mb-1">
                      Crafting your personalized style guide...
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Our AI is analyzing all your visual preferences to create a
                      comprehensive recommendation
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : showError ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="border-2 border-destructive/50 shadow-lg">
                <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
                  <div className="text-4xl">Something went wrong</div>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md">
                    {resultMutation.error?.message}
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={handleRestart}>
                      Start Over
                    </Button>
                    <Button
                      onClick={() => resultMutation.mutate({ selections })}
                      className="bg-gradient-to-r from-rose-600 to-amber-500 text-white"
                    >
                      Try Again
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : showResult ? (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <QuizResult result={result} onRestart={handleRestart} />
            </motion.div>
          ) : showAdvice ? (
            <motion.div
              key="advice"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <AiAdviceCard
                advice={adviceMutation.data ?? null}
                loading={adviceMutation.isPending}
                onContinue={goNext}
              />
            </motion.div>
          ) : (
            <motion.div
              key={currentStep.key}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {currentStep.type === "visual" ? (
                imagesQuery.isLoading ? (
                  <div className="flex flex-col items-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      Loading inspiration...
                    </p>
                  </div>
                ) : (
                  <VisualOptionGrid
                    title={currentStep.title}
                    subtitle={currentStep.subtitle}
                    options={filteredImages()}
                    selectedIds={selections[currentStep.selectionKey]}
                    onToggle={handleVisualToggle}
                    multiSelect={currentStep.multiSelect}
                    columns={currentStep.columns}
                    cardSize={currentStep.cardSize}
                  />
                )
              ) : currentStep.type === "palette" ? (
                <PalettePicker
                  palettes={palettes}
                  selectedId={
                    palettes.find((p) =>
                      p.colors.every((c) => selections.palette.includes(c))
                    )?.id ?? null
                  }
                  onSelect={handlePaletteSelect}
                  loading={paletteMutation.isPending}
                />
              ) : null}

              {/* Navigation buttons */}
              <div className="flex items-center justify-between pt-4">
                <Button
                  variant="ghost"
                  onClick={goBack}
                  disabled={stepIndex === 0}
                  className="gap-1.5"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>

                <Button
                  onClick={goNext}
                  disabled={!canAdvance()}
                  className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:from-rose-700 hover:to-amber-600"
                >
                  {isLastStep ? "Get My Style Guide" : "Next"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  );
}
