"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Minus,
  Plus,
  Send,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { decimalToNumber } from "@/lib/payments";

import { useFormatters } from "@/lib/use-formatters";
type CartItem = {
  key: string;
  service_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
};

function imagesArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export default function PlannerVendorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("planner");
  const f = useFormatters();
  const utils = trpc.useUtils();
  const vendor = trpc.vendors.byId.useQuery({ id });
  const reviews = trpc.vendorReviews.forVendor.useQuery({ vendorId: id });
  const myProposals = trpc.proposals.mine.useQuery({ status: "accepted" });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("EGP");

  const request = trpc.vendorEngagements.request.useMutation({
    onSuccess: (created) => {
      toast.success(t("engagementRequestedToast"));
      utils.vendorEngagements.mineForPlanner.invalidate();
      setOpen(false);
      setCart([]);
      router.push(
        `/dashboard/planner/event/${(created as { event_id: string }).event_id}?tab=vendors`,
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const total = useMemo(
    () => cart.reduce((s, c) => s + c.unit_price * c.quantity, 0),
    [cart],
  );

  function addService(service: {
    id: string;
    name: string;
    description: string | null;
    price_from: unknown;
  }) {
    const price = decimalToNumber(service.price_from);
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.service_id === service.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          key: `s-${service.id}`,
          service_id: service.id,
          name: service.name,
          description: service.description,
          quantity: 1,
          unit_price: price,
        },
      ];
    });
    toast.success(t("addedToCartToast", { name: service.name }));
  }

  function addCustom() {
    setCart((prev) => [
      ...prev,
      {
        key: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        service_id: null,
        name: t("customItemDefault"),
        description: null,
        quantity: 1,
        unit_price: 0,
      },
    ]);
  }

  function updateItem(key: string, patch: Partial<CartItem>) {
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function removeItem(key: string) {
    setCart((prev) => prev.filter((c) => c.key !== key));
  }

  function submit() {
    if (!eventId) {
      toast.error(t("pickEventFirstError"));
      return;
    }
    if (!title.trim()) {
      toast.error(t("giveEngagementTitleError"));
      return;
    }
    if (cart.length === 0) {
      toast.error(t("addAtLeastOneItemError"));
      return;
    }
    if (cart.some((c) => !c.name.trim() || c.unit_price < 0 || c.quantity < 1)) {
      toast.error(t("lineNeedsValidValuesError"));
      return;
    }
    request.mutate({
      event_id: eventId,
      vendor_id: id,
      title: title.trim(),
      notes: notes.trim() || null,
      currency: currency.trim().toUpperCase().slice(0, 3) || "EGP",
      items: cart.map((c) => ({
        service_id: c.service_id,
        name: c.name.trim(),
        description: c.description,
        quantity: c.quantity,
        unit_price: c.unit_price,
      })),
    });
  }

  if (vendor.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!vendor.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t("vendorNotFound")}</p>
      </div>
    );
  }

  const v = vendor.data;
  const events = (myProposals.data ?? []).map((p) => ({
    id: p.event.id,
    title: p.event.title,
    event_date: p.event.event_date,
  }));
  const eventItems = events.map((e) => ({
    value: e.id,
    label: e.event_date
      ? `${e.title} · ${f.date(e.event_date, "medium")}`
      : e.title,
  }));

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <Link
          href="/dashboard/planner/vendors"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-rose-700"
        >
          <ArrowLeft className="size-3 rtl:-scale-x-100" />
          {t("backToVendors")}
        </Link>

        <header className="overflow-hidden rounded-2xl border border-brand-line bg-white/85 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
            <div className="min-w-0 space-y-2">
              <p className="text-eyebrow font-medium text-rose-700/80">
                {v.category}
              </p>
              <h1 className="font-display text-3xl font-light tracking-tight">
                {v.business_name}
              </h1>
              {v.location && (
                <p className="text-sm text-muted-foreground">{v.location}</p>
              )}
              {v.bio && (
                <p className="max-w-2xl text-sm text-foreground/80">{v.bio}</p>
              )}
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-0.5">
                  <Star className="size-3 text-amber-500" />
                  {Number(v.avg_rating).toFixed(1)}
                  <span className="ms-0.5 text-muted-foreground">
                    {t("reviewsCountParens", { count: v.review_count })}
                  </span>
                </span>
                {v.verified && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-100">
                    {t("verifiedBadge")}
                  </span>
                )}
              </div>
            </div>
            <Button
              disabled={cart.length === 0 || events.length === 0}
              onClick={() => setOpen(true)}
              className="gap-1 bg-brand-gradient text-white"
            >
              <ShoppingCart className="size-4" />
              {cart.length === 0
                ? t("cartEmpty")
                : t("requestEngagementCount", { count: cart.length })}
            </Button>
          </div>
        </header>

        {events.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
            {t("needAcceptedEvent")}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-brand-line bg-white/85 backdrop-blur-sm">
              <div className="border-b border-brand-line px-5 py-3">
                <p className="text-eyebrow font-medium text-rose-700/80">
                  {t("catalog")}
                </p>
              </div>
              {v.services.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Store className="mx-auto mb-2 size-6 text-rose-500" />
                  <p className="text-sm text-muted-foreground">
                    {t("noItemsListed")}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  {v.services.map((s) => {
                    const imgs = imagesArray(s.images);
                    return (
                      <div
                        key={s.id}
                        className="flex flex-col overflow-hidden rounded-xl border border-brand-line"
                      >
                        <div className="relative aspect-[4/3] bg-rose-50">
                          {imgs[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imgs[0]}
                              alt={s.name}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-rose-300">
                              <ImageIcon className="size-8" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium leading-tight">
                              {s.name}
                            </p>
                            <p className="font-mono text-sm tabular-nums text-rose-700">
                              {f.currency(decimalToNumber(s.price_from))}
                            </p>
                          </div>
                          {s.description && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {s.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                            {s.subcategory && (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-800 ring-1 ring-rose-100">
                                {s.subcategory}
                              </span>
                            )}
                            <span className="rounded-full bg-stone-50 px-2 py-0.5 ring-1 ring-stone-200">
                              {s.price_unit.replace(/_/g, " ")}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addService(s)}
                            className="mt-auto w-full gap-1"
                          >
                            <Plus className="size-3.5" />
                            {t("addToCart")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {v.portfolio_items.length > 0 && (
              <div className="rounded-2xl border border-brand-line bg-white/85 backdrop-blur-sm">
                <div className="border-b border-brand-line px-5 py-3">
                  <p className="text-eyebrow font-medium text-rose-700/80">
                    {t("portfolioHeading")}
                  </p>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-3">
                  {v.portfolio_items.map((p) => (
                    <div
                      key={p.id}
                      className="overflow-hidden rounded-xl border border-brand-line"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image_url}
                        alt={p.caption ?? "portfolio"}
                        className="aspect-[4/3] w-full object-cover"
                      />
                      {p.caption && (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          {p.caption}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-brand-line bg-white/85 backdrop-blur-sm">
              <div className="border-b border-brand-line px-5 py-3">
                <p className="text-eyebrow font-medium text-rose-700/80">
                  {t("reviewsHeading")}
                </p>
              </div>
              {(reviews.data ?? []).length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {t("noReviewsYet")}
                </div>
              ) : (
                <ul className="divide-y divide-rose-100/70">
                  {(reviews.data ?? []).map((r) => (
                    <li key={r.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {r.author.full_name}
                        </p>
                        <p className="text-xs">
                          {"★".repeat(r.rating)}
                          <span className="text-muted-foreground">
                            {"★".repeat(5 - r.rating)}
                          </span>
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {f.date(r.created_at, "medium")}
                        {r.engagement && (
                          <> · {r.engagement.title}</>
                        )}
                      </p>
                      {r.comment && (
                        <p className="mt-1 text-sm">{r.comment}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-brand-line bg-white/85 backdrop-blur-sm">
              <div className="border-b border-brand-line px-5 py-3">
                <p className="text-eyebrow font-medium text-rose-700/80">
                  {t("engagementCart")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("engagementCartHint")}
                </p>
              </div>
              {cart.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {t("emptyCart")}
                </div>
              ) : (
                <ul className="divide-y divide-rose-100/70">
                  {cart.map((c) => (
                    <li key={c.key} className="space-y-2 px-5 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={c.name}
                          onChange={(e) =>
                            updateItem(c.key, { name: e.target.value })
                          }
                          className="h-10 text-sm sm:h-8"
                        />
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => removeItem(c.key)}
                          className="size-10 text-destructive sm:size-7"
                        >
                          <X className="size-4 sm:size-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() =>
                            updateItem(c.key, {
                              quantity: Math.max(1, c.quantity - 1),
                            })
                          }
                          className="size-10 sm:size-7"
                        >
                          <Minus className="size-4 sm:size-3.5" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          value={c.quantity}
                          onChange={(e) =>
                            updateItem(c.key, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="h-10 w-16 text-center text-sm sm:h-8"
                        />
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() =>
                            updateItem(c.key, { quantity: c.quantity + 1 })
                          }
                          className="size-10 sm:size-7"
                        >
                          <Plus className="size-4 sm:size-3.5" />
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          value={c.unit_price}
                          onChange={(e) =>
                            updateItem(c.key, {
                              unit_price: Math.max(
                                0,
                                Number(e.target.value) || 0,
                              ),
                            })
                          }
                          className="h-10 flex-1 text-end text-sm sm:h-8"
                        />
                      </div>
                      <p className="text-end text-xs text-muted-foreground">
                        {t("subtotal")}{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {f.currency(c.unit_price * c.quantity, currency)}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2 border-t border-brand-line px-5 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span>{t("total")}</span>
                  <span className="font-mono tabular-nums">
                    {f.currency(total, currency)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCustom}
                  className="w-full gap-1"
                >
                  <Plus className="size-3.5" />
                  {t("addCustomLine")}
                </Button>
                {cart.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCart([])}
                    className="w-full gap-1 text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    {t("clearCart")}
                  </Button>
                )}
              </div>
            </div>
          </aside>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("requestEngagement")}</DialogTitle>
              <DialogDescription>
                {t("requestEngagementDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="evt">{t("eventLabel")}</Label>
                <Select
                  items={eventItems}
                  value={eventId}
                  onValueChange={(v) => setEventId(v ?? "")}
                >
                  <SelectTrigger id="evt">
                    <SelectValue placeholder={t("selectAnEvent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {eventItems.map((e) => (
                      <SelectItem key={e.value} value={e.value}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">{t("titleLabel")}</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("engagementTitlePlaceholder", {
                    name: v.business_name,
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cur">{t("currencyLabel")}</Label>
                <CurrencyInput
                  id="cur"
                  value={currency}
                  onChange={setCurrency}
                  placeholder="EGP"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">{t("notesForVendorLabel")}</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={t("vendorNotesPlaceholder")}
                  className="resize-none"
                />
              </div>
              <div className="rounded-xl border border-brand-line bg-rose-50/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{t("total")}</span>{" "}
                <span className="font-mono tabular-nums">
                  {f.currency(total, currency)}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={request.isPending}
                onClick={submit}
                className="gap-1 bg-brand-gradient text-white"
              >
                {request.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {t("sendRequest")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
