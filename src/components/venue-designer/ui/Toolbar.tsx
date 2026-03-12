"use client";
import {
  MousePointer2,
  Move,
  RotateCw,
  Maximize2,
  Trash2,
  Undo2,
  Redo2,
  Copy,
} from "lucide-react";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActiveTool } from "@/types/venue-designer";
import { useEffect } from "react";

const TOOLS: { tool: ActiveTool; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { tool: "select", icon: MousePointer2, label: "Select" },
  { tool: "translate", icon: Move, label: "Move" },
  { tool: "rotate", icon: RotateCw, label: "Rotate" },
  { tool: "scale", icon: Maximize2, label: "Scale" },
];

export function Toolbar() {
  const activeTool = useVenueDesignerStore((s) => s.activeTool);
  const setTool = useVenueDesignerStore((s) => s.setTool);
  const selectedId = useVenueDesignerStore((s) => s.selectedId);
  const removeItem = useVenueDesignerStore((s) => s.removeItem);
  const duplicateItem = useVenueDesignerStore((s) => s.duplicateItem);
  const undo = useVenueDesignerStore((s) => s.undo);
  const redo = useVenueDesignerStore((s) => s.redo);
  const past = useVenueDesignerStore((s) => s.past);
  const future = useVenueDesignerStore((s) => s.future);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) removeItem(selectedId);
      }
      if (e.key === "v") setTool("select");
      if (e.key === "g") setTool("translate");
      if (e.key === "r") setTool("rotate");
      if (e.key === "s" && !e.metaKey && !e.ctrlKey) setTool("scale");
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        if (selectedId) duplicateItem(selectedId);
      }
      if (e.key === "Escape") {
        useVenueDesignerStore.getState().cancelPlacing();
        useVenueDesignerStore.getState().select(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedId, removeItem, duplicateItem, undo, redo, setTool]);

  return (
    <div className="flex items-center gap-1 rounded-xl bg-background/90 backdrop-blur-sm border shadow-sm px-2 py-1.5">
      {TOOLS.map(({ tool, icon: Icon, label }) => (
        <Button
          key={tool}
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            activeTool === tool && "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300"
          )}
          onClick={() => setTool(tool)}
          title={label}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}

      <div className="mx-1 h-5 w-px bg-border" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={!selectedId}
        onClick={() => selectedId && duplicateItem(selectedId)}
        title="Duplicate (Cmd+D)"
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        disabled={!selectedId}
        onClick={() => selectedId && removeItem(selectedId)}
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={past.length === 0}
        onClick={undo}
        title="Undo (Cmd+Z)"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={future.length === 0}
        onClick={redo}
        title="Redo (Cmd+Shift+Z)"
      >
        <Redo2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
