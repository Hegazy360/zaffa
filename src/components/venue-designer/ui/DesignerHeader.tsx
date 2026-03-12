"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, FolderOpen, Download } from "lucide-react";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";

interface DesignerHeaderProps {
  onSave?: (name: string) => void;
  onLoad?: () => void;
  saving?: boolean;
}

export function DesignerHeader({ onSave, onLoad, saving }: DesignerHeaderProps) {
  const [name, setName] = useState("Untitled Design");
  const items = useVenueDesignerStore((s) => s.items);
  const serialize = useVenueDesignerStore((s) => s.serialize);

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
          onClick={handleExport}
        >
          <Download className="h-3 w-3" />
          Export
        </Button>
      </div>
    </div>
  );
}
