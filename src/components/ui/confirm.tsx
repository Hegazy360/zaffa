"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * `await confirm({...})`, a drop-in shape for `window.confirm`.
 *
 * The eleven `window.confirm` call sites all read
 * `if (window.confirm(msg)) { destroy() }`. Anything that forces those to be
 * restructured into open/close state and a rendered dialog would have meant
 * eleven bespoke rewrites, and the ones nobody wanted to touch would have kept
 * the native dialog. So the hook keeps the shape: one `await`, a boolean back.
 *
 * The dialog itself is mounted once at the root, and the promise it resolves
 * is stored alongside the request. Two confirms cannot be open at once, which
 * matches the semantics of the thing being replaced.
 */

export interface ConfirmOptions {
  title: string;
  /** Optional second line. Say what will be lost, not "are you sure". */
  description?: string;
  /** Label for the confirming action. Defaults to a translated "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirming action as destructive. Use it when it deletes. */
  destructive?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = React.createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  // Settle the promise exactly once, whichever way the dialog closes -
  // including Escape and a backdrop dismissal, which `onOpenChange` reports
  // and a naive button-only handler would leave hanging forever.
  const settle = React.useCallback(
    (ok: boolean) => {
      setPending((current) => {
        current?.resolve(ok);
        return null;
      });
    },
    [],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          {pending?.description && (
            <AlertDialogDescription>
              {pending.description}
            </AlertDialogDescription>
          )}
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {pending?.cancelLabel ?? t("cancel")}
            </Button>
            <Button
              variant={pending?.destructive ? "destructive" : "cta"}
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel ?? t("confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}
