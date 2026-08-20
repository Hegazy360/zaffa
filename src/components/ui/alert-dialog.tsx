"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";

/**
 * A confirmation dialog, replacing `window.confirm`.
 *
 * `window.confirm` was used at eleven call sites, several of them for
 * destructive actions - deleting a design, deleting an event, removing a
 * review. It is the wrong tool for three separate reasons: it blocks the main
 * thread, it cannot be styled or translated (one call site asked "Remove this
 * recommendation?" in English regardless of locale), and its OS-drawn chrome
 * makes a product look like it lost an argument with the browser.
 *
 * `AlertDialog` rather than `Dialog`: the role is different. An alert dialog
 * traps focus, is not dismissible by clicking outside, and announces itself as
 * requiring a response, which is correct when the next click deletes
 * something.
 */

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogClose({ ...props }: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
  );
}

function AlertDialogContent({
  className,
  children,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 isolate z-50 bg-black/20 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      {/* `left-1/2 -translate-x-1/2` is deliberately PHYSICAL, not the logical
          `start-1/2` used elsewhere. Centring is symmetric, but `start-1/2`
          resolves to `right: 50%` under RTL while the translate stays
          physical, which put every dialog a full popup-width off-centre in
          Arabic, the primary locale. That bug shipped once (ZAF-36); it is
          written correctly here from the first line, and
          `tests/rtl-centering.test.ts` scans for the broken pairing. */}
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-plate bg-background p-5 text-sm ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "font-display text-lg font-light tracking-tight text-balance",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-pretty text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        // Column-reverse on mobile so the confirming action sits under the
        // thumb, and the cancel above it - the reverse of reading order, on
        // purpose, because the destructive one should not be the easy one.
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
};
