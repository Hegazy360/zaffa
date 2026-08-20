"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";

/** Opens the shared confirmation dialog so its behaviour — and, critically,
 *  its centring under RTL — can be checked on a real page. */
export function ConfirmDemo() {
  const confirm = useConfirm();
  const [last, setLast] = useState<string>("—");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        onClick={async () => {
          const ok = await confirm({
            title: "Delete this design?",
            description: "This cannot be undone.",
            confirmLabel: "Delete",
            destructive: true,
          });
          setLast(ok ? "confirmed" : "cancelled");
        }}
      >
        Open confirm
      </Button>
      <span className="text-xs text-muted-foreground">last: {last}</span>
    </div>
  );
}
