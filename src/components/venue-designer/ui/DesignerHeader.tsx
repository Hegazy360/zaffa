"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Save,
  LayoutGrid,
  Check,
  Loader2,
  Circle,
  Image as ImageIcon,
} from "lucide-react";
import { MediaGalleryDialog } from "./MediaGalleryDialog";

interface DesignerHeaderProps {
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  saving: boolean;
  saveStatus: "saved" | "saving" | "unsaved";
  designId?: string;
}

export function DesignerHeader({
  name,
  onNameChange,
  onSave,
  saving,
  saveStatus,
  designId,
}: DesignerHeaderProps) {
  const router = useRouter();
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => router.push("/venue-designer")}
      >
        <LayoutGrid className="h-3 w-3" />
        My Designs
      </Button>

      <div className="h-4 w-px bg-border" />

      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="w-48 border-none bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
        placeholder="Design name..."
      />

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {saveStatus === "saving" ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Saving...</span>
          </>
        ) : saveStatus === "saved" ? (
          <>
            <Check className="h-3 w-3 text-green-500" />
            <span>Saved</span>
          </>
        ) : (
          <>
            <Circle className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
            <span>Unsaved</span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {designId && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setMediaGalleryOpen(true)}
            >
              <ImageIcon className="h-3 w-3" />
              Gallery
            </Button>
            <MediaGalleryDialog
              open={mediaGalleryOpen}
              onOpenChange={setMediaGalleryOpen}
              designId={designId}
            />
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={onSave}
          disabled={saving || saveStatus === "saved"}
        >
          <Save className="h-3 w-3" />
          Save
        </Button>
      </div>
    </div>
  );
}
