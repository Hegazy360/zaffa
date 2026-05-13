"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, X } from "lucide-react";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import {
  MAX_REFERENCES_PER_CATEGORY,
  type ReferenceCategory,
} from "@/types/venue-designer";
import { ReferencePickerDialog } from "./ReferencePickerDialog";

interface ReferenceCategoryCardProps {
  category: ReferenceCategory;
}

const CATEGORY_LABEL_KEY: Record<ReferenceCategory, string> = {
  overall_vibe: "categoryOverallVibe",
  tables: "categoryTables",
  flowers: "categoryFlowers",
  lighting: "categoryLighting",
  venue_decor: "categoryVenueDecor",
};

const CATEGORY_DESC_KEY: Record<ReferenceCategory, string> = {
  overall_vibe: "categoryDescOverallVibe",
  tables: "categoryDescTables",
  flowers: "categoryDescFlowers",
  lighting: "categoryDescLighting",
  venue_decor: "categoryDescVenueDecor",
};

export function ReferenceCategoryCard({ category }: ReferenceCategoryCardProps) {
  const t = useTranslations("designer");
  const refs = useVenueDesignerStore((s) => s.references[category]);
  const removeReference = useVenueDesignerStore((s) => s.removeReference);
  const [open, setOpen] = useState(false);

  const empty = refs.length === 0;
  const categoryLabel = t(CATEGORY_LABEL_KEY[category]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>{categoryLabel}</CardTitle>
              <CardDescription className="mt-1">
                {t(CATEGORY_DESC_KEY[category])}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant={empty ? "default" : "outline"}
              size="sm"
              onClick={() => setOpen(true)}
              className="h-9 shrink-0 gap-1.5 sm:h-8"
            >
              {empty ? <Plus className="size-4" /> : <Pencil className="size-3.5" />}
              {empty ? t("addReferences") : t("edit")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {empty ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-28 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent"
            >
              {t("pickInspirationN", { max: MAX_REFERENCES_PER_CATEGORY })}
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {refs.map((r) => (
                <div
                  key={r.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.thumbnailUrl ?? r.url}
                    alt={t("categoryRefAlt", { category: categoryLabel })}
                    className="h-full w-full object-cover"
                  />
                  {/*
                    Remove control. On touch devices we can't rely on
                    hover, so the button is always visible (with a
                    larger 32px tap target). From `md` upward we go
                    back to the original hover-reveal so a static grid
                    looks clean.
                  */}
                  <button
                    type="button"
                    onClick={() => removeReference(category, r.id)}
                    aria-label={t("removeReferenceAria")}
                    className="absolute end-1 top-1 grid size-8 place-items-center rounded-full bg-black/65 text-white shadow-sm transition-opacity hover:bg-black/85 md:size-6 md:end-1.5 md:top-1.5 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <X className="size-4 md:size-3.5" />
                  </button>
                </div>
              ))}
              {refs.length < MAX_REFERENCES_PER_CATEGORY && (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent"
                  aria-label={t("addReferences")}
                >
                  <Plus className="size-5" />
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ReferencePickerDialog
        open={open}
        onOpenChange={setOpen}
        category={category}
      />
    </>
  );
}
