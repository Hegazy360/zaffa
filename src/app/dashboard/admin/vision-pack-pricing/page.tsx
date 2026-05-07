"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Globe, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EU_MEMBER_STATES,
  SEED_PRICING,
  formatPriceLabel,
} from "@/lib/vision-pack-pricing";

type Row = {
  country_code: string;
  amount: number;
  currency: string;
  notes: string | null;
  updated_at: Date;
  updated_by: string | null;
};

/**
 * Admin surface for the per-country Vision Pack pricing table.
 * Override rows in `vision_pack_pricing` win over the seed matrix in
 * `src/lib/vision-pack-pricing.ts`. Use this page to:
 *   - bump the price for a market (e.g. test elasticity)
 *   - add support for a new country without a deploy
 *   - override the global DEFAULT
 *
 * Seed entries that don't have an override are listed in a "seed
 * pricing" reference panel below the editable table so the operator
 * can see the full picture in one place.
 */
export default function AdminVisionPackPricingPage() {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.admin.listVisionPackPricing.useQuery();
  const [editing, setEditing] = useState<Partial<Row> | null>(null);

  const upsert = trpc.admin.upsertVisionPackPricing.useMutation({
    onSuccess: () => {
      utils.admin.listVisionPackPricing.invalidate();
      utils.visionPacks.pricing.invalidate();
      toast.success("Pricing saved");
      setEditing(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const remove = trpc.admin.deleteVisionPackPricing.useMutation({
    onSuccess: () => {
      utils.admin.listVisionPackPricing.invalidate();
      utils.visionPacks.pricing.invalidate();
      toast.success("Override removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const overriddenCodes = new Set(rows?.map((r) => r.country_code) ?? []);
  const seedReferenceRows: Array<{ code: string; amount: number; currency: string; note: string }> =
    Object.entries(SEED_PRICING)
      .filter(([code]) => !overriddenCodes.has(code))
      .map(([code, p]) => ({
        code,
        amount: p.amount,
        currency: p.currency,
        note: code === "EU" ? `applies to ${EU_MEMBER_STATES.size} EU member states` : "",
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
              Vision Pack
            </p>
            <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight">
              Pricing by country
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Per-country price overrides. The seed matrix lives in code as
              a floor — every row here wins. Use the special{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">DEFAULT</code>{" "}
              code to override the unmapped fallback.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setEditing({})}
            className="h-9 gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Add override
          </Button>
        </header>

        <section className="rounded-2xl border border-rose-100/70 bg-white/80 p-4 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-3.5 text-rose-500" />
            <h2 className="text-sm font-semibold tracking-tight">
              Active overrides{rows ? ` (${rows.length})` : ""}
            </h2>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-rose-500" />
            </div>
          ) : !rows || rows.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground">
              No overrides yet. The seed matrix is in effect for every
              country — see reference below.
            </p>
          ) : (
            <ul className="divide-y divide-rose-100/70 dark:divide-rose-900/30">
              {rows.map((row) => (
                <li
                  key={row.country_code}
                  className="flex items-center gap-4 py-3 text-sm"
                >
                  <code className="grid size-9 shrink-0 place-items-center rounded-md bg-rose-50 font-mono text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                    {row.country_code}
                  </code>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {formatPriceLabel({
                        amount: row.amount,
                        currency: row.currency,
                      })}
                    </p>
                    {row.notes ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {row.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-xs"
                      onClick={() => setEditing(row)}
                    >
                      <Pencil className="size-3" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove the ${row.country_code} override? It'll fall back to the seed matrix.`,
                          )
                        ) {
                          remove.mutate({ country_code: row.country_code });
                        }
                      }}
                    >
                      <Trash2 className="size-3" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-rose-100/70 bg-white/60 p-4 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/60">
          <div className="mb-3 flex items-center gap-2">
            <Globe className="size-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">
              Seed matrix (read-only)
            </h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            The fallback floor when no override exists. To change a seed
            entry, add an override above with the same country code.
          </p>
          <ul className="divide-y divide-rose-100/40 dark:divide-rose-900/20">
            {seedReferenceRows.map((row) => (
              <li
                key={row.code}
                className="flex items-center gap-4 py-2 text-xs"
              >
                <code className="grid size-7 shrink-0 place-items-center rounded-md bg-muted font-mono text-[10px] font-semibold text-muted-foreground">
                  {row.code}
                </code>
                <span className="min-w-0 flex-1 font-medium">
                  {formatPriceLabel({
                    amount: row.amount,
                    currency: row.currency,
                  })}
                </span>
                {row.note ? (
                  <span className="shrink-0 text-muted-foreground/85">
                    {row.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <PricingDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={(values) => upsert.mutate(values)}
        saving={upsert.isPending}
      />
    </div>
  );
}

interface PricingDialogProps {
  editing: Partial<Row> | null;
  onClose: () => void;
  onSave: (values: {
    country_code: string;
    amount: number;
    currency: string;
    notes?: string;
  }) => void;
  saving: boolean;
}

function PricingDialog({ editing, onClose, onSave, saving }: PricingDialogProps) {
  const isOpen = editing !== null;
  const isEdit = !!editing?.country_code;
  const [country, setCountry] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [notes, setNotes] = useState("");

  // Re-seed inputs whenever the editing target changes — equivalent to a
  // "key on identity" pattern but lighter than blowing away the whole
  // dialog on each open.
  const seededFor = isOpen ? editing?.country_code ?? "__new__" : null;
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (isOpen && seededFor !== seededFrom) {
    setSeededFrom(seededFor);
    setCountry(editing?.country_code ?? "");
    setAmount(editing?.amount?.toString() ?? "");
    setCurrency(editing?.currency ?? "");
    setNotes(editing?.notes ?? "");
  }

  const handleSubmit = () => {
    const trimmedCountry = country.trim().toUpperCase();
    const parsedAmount = Number(amount);
    const trimmedCurrency = currency.trim().toUpperCase();
    if (!trimmedCountry) return toast.error("Country code is required");
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1)
      return toast.error("Amount must be a positive integer");
    if (!/^[A-Z]{3}$/.test(trimmedCurrency))
      return toast.error("Currency must be a 3-letter ISO code (e.g. EGP, USD)");
    onSave({
      country_code: trimmedCountry,
      amount: Math.round(parsedAmount),
      currency: trimmedCurrency,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit pricing" : "Add override"}</DialogTitle>
          <DialogDescription>
            Override the seed matrix for one country, or use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">DEFAULT</code>{" "}
            to override the unmapped fallback.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="country">Country code</Label>
            <Input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="EG, AE, US, DEFAULT…"
              maxLength={8}
              disabled={isEdit}
              className="font-mono uppercase"
            />
            <p className="text-[11px] text-muted-foreground">
              ISO-3166-1 alpha-2 (e.g. EG, AE) or the literal{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">DEFAULT</code>.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="499"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="EGP"
                maxLength={3}
                className="font-mono uppercase"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this override exists, or campaign tag…"
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving}
            className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {isEdit ? "Save changes" : "Add override"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
