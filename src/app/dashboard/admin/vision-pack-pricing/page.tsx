"use client";

import { useMemo, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EU_MEMBER_STATES,
  SEED_PRICING,
  formatPriceLabel,
  minorToMajor,
} from "@/lib/vision-pack-pricing";
import {
  PACK_SKUS,
  PRICED_PACK_SKUS,
  type PackSkuId,
} from "@/lib/vision-pack";
import { useConfirm } from "@/components/ui/confirm";

type Row = {
  sku: string;
  country_code: string;
  amount: number;
  currency: string;
  notes: string | null;
  updated_at: Date;
  updated_by: string | null;
};

/**
 * Admin surface for the per-(SKU, country) Vision Pack pricing table.
 * Override rows in `vision_pack_pricing` win over the seed matrix in
 * `src/lib/vision-pack-pricing.ts`. Use this page to:
 *   - bump the price for a market (e.g. test elasticity)
 *   - add support for a new country without a deploy
 *   - override the global DEFAULT for either tier
 *
 * Amounts are stored in **minor units** (cents/piastres) to support
 * fractional retail prices like $19.99. The dialog accepts the price
 * in major units ("19.99") and the submit handler converts before
 * upserting.
 *
 * Each tier has its own section so operators can see all overrides for
 * the Design Pack and the Vision Pack at a glance, with the seed
 * fallback rows listed below for reference.
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

  const rowsBySku = useMemo(() => {
    const out = new Map<string, Row[]>();
    for (const sku of PRICED_PACK_SKUS) out.set(sku, []);
    for (const row of rows ?? []) {
      if (!out.has(row.sku)) out.set(row.sku, []);
      out.get(row.sku)!.push(row);
    }
    return out;
  }, [rows]);

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <p className="text-eyebrow font-medium text-rose-700/80">
              Vision Pack
            </p>
            <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight">
              Pricing by tier and country
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Per-(tier, country) price overrides. The seed matrix in code
              is the floor; every row here wins. Use the special{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">DEFAULT</code>{" "}
              code to override the unmapped fallback for a tier.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setEditing({})}
            className="h-9 gap-1.5 bg-brand-gradient text-white hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Add override
          </Button>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : (
          <div className="space-y-8">
            {PRICED_PACK_SKUS.map((sku) => (
              <TierSection
                key={sku}
                sku={sku}
                overrides={rowsBySku.get(sku) ?? []}
                onEdit={(row) => setEditing(row)}
                onRemove={(row) =>
                  remove.mutate({ sku: row.sku as PackSkuId, country_code: row.country_code })
                }
                removing={remove.isPending}
              />
            ))}
          </div>
        )}
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

interface TierSectionProps {
  sku: PackSkuId;
  overrides: Row[];
  onEdit: (row: Row) => void;
  onRemove: (row: Row) => void;
  removing: boolean;
}

function TierSection({
  sku,
  overrides,
  onEdit,
  onRemove,
  removing,
}: TierSectionProps) {
  const confirm = useConfirm();
  const meta = PACK_SKUS[sku];
  const overriddenCodes = new Set(overrides.map((r) => r.country_code));
  const seedBucket = SEED_PRICING[sku] ?? {};
  const seedReferenceRows = Object.entries(seedBucket)
    .filter(([code]) => !overriddenCodes.has(code))
    .map(([code, p]) => ({
      code,
      amount: p.amount,
      currency: p.currency,
      note: code === "EU" ? `applies to ${EU_MEMBER_STATES.size} EU member states` : "",
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <section className="space-y-3 rounded-2xl border border-brand-line bg-white/80 p-4 backdrop-blur-sm">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-eyebrow font-semibold text-rose-700/80">
            {meta.name}
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {meta.id}
          </p>
        </div>
        <div className="text-end text-xs text-muted-foreground">
          {meta.quotas.renders} renders · {meta.quotas.videos} videos ·{" "}
          {meta.quotas.styles} styles
        </div>
      </header>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-3.5 text-rose-500" />
          <h2 className="text-sm font-semibold tracking-tight">
            Active overrides ({overrides.length})
          </h2>
        </div>
        {overrides.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            No overrides yet for this tier. Seed prices below are in effect.
          </p>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {overrides.map((row) => (
              <li
                key={`${row.sku}:${row.country_code}`}
                className="flex items-center gap-4 py-3 text-sm"
              >
                <code className="grid size-9 shrink-0 place-items-center rounded-md bg-rose-50 font-mono text-xs font-semibold text-rose-700">
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
                    onClick={() => onEdit(row)}
                  >
                    <Pencil className="size-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                    disabled={removing}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Remove the ${row.country_code} override for ${meta.name}?`,
                          description: "It'll fall back to the seed matrix.",
                          confirmLabel: "Remove",
                          destructive: true,
                        })
                      ) {
                        onRemove(row);
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
      </div>

      <div className="rounded-xl border border-brand-line bg-white/60 p-3 backdrop-blur-sm">
        <div className="mb-2 flex items-center gap-2">
          <Globe className="size-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold tracking-tight">
            Seed matrix (read-only)
          </h3>
        </div>
        <ul className="divide-y divide-rose-100/40">
          {seedReferenceRows.map((row) => (
            <li
              key={row.code}
              className="flex items-center gap-4 py-2 text-xs"
            >
              <code className="grid size-7 shrink-0 place-items-center rounded-md bg-muted font-mono text-xs font-semibold text-muted-foreground">
                {row.code}
              </code>
              <span className="min-w-0 flex-1 font-medium">
                {formatPriceLabel({
                  amount: row.amount,
                  currency: row.currency,
                })}
              </span>
              {row.note ? (
                <span className="shrink-0 text-muted-foreground">
                  {row.note}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

interface PricingDialogProps {
  editing: Partial<Row> | null;
  onClose: () => void;
  onSave: (values: {
    sku: PackSkuId;
    country_code: string;
    amount: number;
    currency: string;
    notes?: string;
  }) => void;
  saving: boolean;
}

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

function PricingDialog({ editing, onClose, onSave, saving }: PricingDialogProps) {
  const isOpen = editing !== null;
  const isEdit = !!editing?.country_code && !!editing?.sku;
  const [sku, setSku] = useState<PackSkuId>(PRICED_PACK_SKUS[0]);
  const [country, setCountry] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [notes, setNotes] = useState("");

  // Re-seed inputs whenever the editing target changes — equivalent to a
  // "key on identity" pattern but lighter than blowing away the whole
  // dialog on each open.
  const seededFor = isOpen
    ? `${editing?.sku ?? "__new__"}|${editing?.country_code ?? "__new__"}`
    : null;
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (isOpen && seededFor !== seededFrom) {
    setSeededFrom(seededFor);
    setSku((editing?.sku as PackSkuId) ?? PRICED_PACK_SKUS[0]);
    setCountry(editing?.country_code ?? "");
    // Convert stored minor units back to major units for display in the
    // input. Author-friendly: an admin sees "19.99" instead of 1999.
    setAmount(
      editing?.amount != null && editing?.currency
        ? minorToMajor(editing.amount, editing.currency).toString()
        : "",
    );
    setCurrency(editing?.currency ?? "");
    setNotes(editing?.notes ?? "");
  }

  const handleSubmit = () => {
    const trimmedCountry = country.trim().toUpperCase();
    const trimmedCurrency = currency.trim().toUpperCase();
    const parsedMajor = Number(amount);
    if (!trimmedCountry) return toast.error("Country code is required");
    if (!Number.isFinite(parsedMajor) || parsedMajor < 0)
      return toast.error("Amount must be a non-negative number");
    if (!/^[A-Z]{3}$/.test(trimmedCurrency))
      return toast.error("Currency must be a 3-letter ISO code (e.g. EGP, USD)");
    // Convert major-units input to minor units for storage. Zero-decimal
    // currencies (JPY, KRW, …) round to integer; everything else *100.
    const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(trimmedCurrency);
    const minor = isZeroDecimal
      ? Math.round(parsedMajor)
      : Math.round(parsedMajor * 100);
    onSave({
      sku,
      country_code: trimmedCountry,
      amount: minor,
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
            Override the seed matrix for one (tier, country) pair, or use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">DEFAULT</code>{" "}
            to override the unmapped fallback for the chosen tier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sku">Tier</Label>
            <Select
              value={sku}
              onValueChange={(v) => setSku(v as PackSkuId)}
              disabled={isEdit}
            >
              <SelectTrigger id="sku">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICED_PACK_SKUS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {PACK_SKUS[id].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Tier id: <code>{sku}</code>
            </p>
          </div>

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
            <p className="text-xs text-muted-foreground">
              ISO-3166-1 alpha-2 (e.g. EG, AE) or the literal{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">DEFAULT</code>.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="19.99"
                inputMode="decimal"
              />
              <p className="text-xs text-muted-foreground">
                Major units (e.g. <code>19.99</code> for $19.99).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
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
            className="gap-1.5 bg-brand-gradient text-white hover:opacity-90"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {isEdit ? "Save changes" : "Add override"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
