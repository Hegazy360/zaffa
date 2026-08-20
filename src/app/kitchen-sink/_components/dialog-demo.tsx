"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Opens the shipped `Dialog` so its RTL centring can be measured on a real
 * instance.
 *
 * The distinction matters: `rtl.spec.ts` used to assert the *geometry* of the
 * class pairing on a synthesised div, which proved that `left-1/2` centres and
 * `start-1/2` does not — but not which of the two the component actually uses.
 * Re-introducing the bug left that test green.
 */
export function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A dialog</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Measured by the RTL spec. It must be centred in both directions.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
