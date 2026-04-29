"use client";

import { useState } from "react";
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
  REFERENCE_CATEGORY_DESCRIPTIONS,
  REFERENCE_CATEGORY_LABELS,
  type ReferenceCategory,
} from "@/types/venue-designer";
import { ReferencePickerDialog } from "./ReferencePickerDialog";

interface ReferenceCategoryCardProps {
  category: ReferenceCategory;
}

export function ReferenceCategoryCard({ category }: ReferenceCategoryCardProps) {
  const refs = useVenueDesignerStore((s) => s.references[category]);
  const removeReference = useVenueDesignerStore((s) => s.removeReference);
  const [open, setOpen] = useState(false);

  const empty = refs.length === 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{REFERENCE_CATEGORY_LABELS[category]}</CardTitle>
              <CardDescription className="mt-1">
                {REFERENCE_CATEGORY_DESCRIPTIONS[category]}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant={empty ? "default" : "outline"}
              size="sm"
              onClick={() => setOpen(true)}
              className="shrink-0 gap-1.5"
            >
              {empty ? <Plus className="size-3.5" /> : <Pencil className="size-3.5" />}
              {empty ? "Add references" : "Edit"}
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
              Pick up to {MAX_REFERENCES_PER_CATEGORY} inspiration photos
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
                    alt={`${REFERENCE_CATEGORY_LABELS[category]} reference`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeReference(category, r.id)}
                    aria-label="Remove reference"
                    className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {refs.length < MAX_REFERENCES_PER_CATEGORY && (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent"
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
