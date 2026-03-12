"use client";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { ITEM_CATALOG } from "@/types/venue-designer";
import { Button } from "@/components/ui/button";
import { Trash2, Copy } from "lucide-react";

export function PropertiesPanel() {
  const selectedId = useVenueDesignerStore((s) => s.selectedId);
  const items = useVenueDesignerStore((s) => s.items);
  const updateItem = useVenueDesignerStore((s) => s.updateItem);
  const removeItem = useVenueDesignerStore((s) => s.removeItem);
  const duplicateItem = useVenueDesignerStore((s) => s.duplicateItem);

  const item = items.find((i) => i.id === selectedId);
  if (!item) return null;

  const catalogEntry = ITEM_CATALOG.find((c) => c.type === item.type);

  return (
    <div className="absolute bottom-4 right-4 w-56 rounded-xl bg-background/90 backdrop-blur-sm border shadow-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {catalogEntry?.icon} {catalogEntry?.label}
        </h4>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => duplicateItem(item.id)}
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => removeItem(item.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {item.color !== undefined && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Color</label>
          <input
            type="color"
            value={item.color || "#ffffff"}
            onChange={(e) => updateItem(item.id, { color: e.target.value })}
            className="h-8 w-full cursor-pointer rounded border"
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Position</label>
        <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
          <span>X: {item.position[0].toFixed(1)}</span>
          <span>Y: {item.position[1].toFixed(1)}</span>
          <span>Z: {item.position[2].toFixed(1)}</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Rotation Y</label>
        <input
          type="range"
          min={0}
          max={360}
          value={((item.rotation[1] * 180) / Math.PI + 360) % 360}
          onChange={(e) => {
            const deg = Number(e.target.value);
            updateItem(item.id, {
              rotation: [item.rotation[0], (deg * Math.PI) / 180, item.rotation[2]],
            });
          }}
          className="w-full"
        />
      </div>
    </div>
  );
}
