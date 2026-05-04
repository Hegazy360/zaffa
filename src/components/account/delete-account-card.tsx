"use client";

import { useState } from "react";
import { Loader2, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormatters } from "@/lib/use-formatters";

const CONFIRM_PHRASE = "DELETE";

/**
 * Self-serve account deletion with a 14-day soft-delete grace window.
 * Until the cron worker picks the row up the user can sign back in and
 * cancel the deletion from this same component, which will be in its
 * "scheduled" state.
 */
export function DeleteAccountCard() {
  const t = useTranslations("account");
  const f = useFormatters();
  const utils = trpc.useUtils();
  const status = trpc.account.deletionStatus.useQuery();
  const requestDel = trpc.account.requestDeletion.useMutation({
    onSuccess: () => {
      toast.success(t("deletionScheduled"));
      utils.account.deletionStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const cancelDel = trpc.account.cancelDeletion.useMutation({
    onSuccess: () => {
      toast.success(t("deletionCancelled"));
      utils.account.deletionStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  if (status.data?.scheduledFor) {
    return (
      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-900">
              {t("deletionPending")}
            </p>
            <p className="mt-1 text-xs text-amber-900/80">
              {t("deletionPendingHint", {
                date: f.date(status.data.scheduledFor, "long"),
              })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={cancelDel.isPending}
            onClick={() => cancelDel.mutate()}
            className="gap-1.5"
          >
            {cancelDel.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Undo2 className="size-3.5" />
            )}
            {t("cancelDeletion")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-200/70 bg-red-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t("deleteAccount")}</p>
          <p className="text-xs text-muted-foreground">
            {t("deleteAccountHint")}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-red-200 text-red-700 hover:bg-red-100 hover:text-red-800"
              />
            }
          >
            <Trash2 className="size-3.5" />
            {t("deleteAccount")}
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
              <DialogDescription>{t("deleteDialogDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm-delete">
                {t("typeToConfirm", { phrase: CONFIRM_PHRASE })}
              </Label>
              <Input
                id="confirm-delete"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={CONFIRM_PHRASE}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={requestDel.isPending}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                disabled={confirm !== CONFIRM_PHRASE || requestDel.isPending}
                onClick={() => requestDel.mutate({ confirmText: confirm })}
                className="gap-1.5 bg-red-700 text-white hover:bg-red-800"
              >
                {requestDel.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                {t("confirmDelete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
