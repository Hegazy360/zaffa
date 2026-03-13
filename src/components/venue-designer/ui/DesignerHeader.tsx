"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, FolderOpen, Download, Upload, Sparkles, Trash2, Camera } from "lucide-react";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { AIGenerateDialog } from "./AIGenerateDialog";
import { RenderDialog } from "./RenderDialog";

interface DesignerHeaderProps {
  onSave?: (name: string) => void;
  onLoad?: () => void;
  saving?: boolean;
}

export function DesignerHeader({ onSave, onLoad, saving }: DesignerHeaderProps) {
  const [name, setName] = useState("Untitled Design");
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [renderDialogOpen, setRenderDialogOpen] = useState(false);
  const items = useVenueDesignerStore((s) => s.items);
  const serialize = useVenueDesignerStore((s) => s.serialize);
  const deserialize = useVenueDesignerStore((s) => s.deserialize);
  const clearScene = useVenueDesignerStore((s) => s.clearScene);

  const handleExport = () => {
    const data = serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.venue && Array.isArray(data.items)) {
          deserialize(data);
          const imported = file.name.replace(/\.json$/, "").replace(/_/g, " ");
          setName(imported);
        }
      } catch {
        /* invalid file */
      }
    };
    input.click();
  };

  return (
    <div className="flex items-center gap-3 rounded-xl bg-background/90 backdrop-blur-sm border shadow-sm px-3 py-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="bg-transparent border-none text-sm font-medium outline-none w-40 placeholder:text-muted-foreground"
        placeholder="Design name..."
      />

      <span className="text-xs text-muted-foreground">
        {items.length} item{items.length !== 1 ? "s" : ""}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          onClick={() => setAiDialogOpen(true)}
        >
          <Sparkles className="h-3 w-3" />
          AI Generate
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          onClick={() => setRenderDialogOpen(true)}
          disabled={items.length === 0}
        >
          <Camera className="h-3 w-3" />
          Render
        </Button>

        <AIGenerateDialog open={aiDialogOpen} onOpenChange={setAiDialogOpen} />
        <RenderDialog open={renderDialogOpen} onOpenChange={setRenderDialogOpen} />

        {onSave && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={() => onSave(name)}
            disabled={saving}
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
        {onLoad && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={onLoad}
          >
            <FolderOpen className="h-3 w-3" />
            Load
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={handleImport}
        >
          <Upload className="h-3 w-3" />
          Import
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={handleExport}
        >
          <Download className="h-3 w-3" />
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => {
            if (items.length === 0) return;
            if (window.confirm(`Clear all ${items.length} items from the scene? This can be undone with Ctrl+Z.`)) {
              clearScene();
            }
          }}
          disabled={items.length === 0}
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </div>
    </div>
  );
}
