"use client";

import { useRef, useState } from "react";
import {
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { useVendorImageUpload } from "@/hooks/use-vendor-image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
interface VendorService {
  id: string;
  name: string;
  description: string | null;
  price_from: number | string | { toString(): string };
  price_unit: string;
  subcategory: string | null;
  images: unknown;
  lead_time_days: number | null;
  available: boolean;
}

function imagesArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export default function VendorCatalogPage() {
  const utils = trpc.useUtils();
  const f = useFormatters();
  const t = useTranslations("vendor");
  const tMarketplace = useTranslations("marketplace");
  const me = trpc.vendors.me.useQuery();
  const list = trpc.vendors.services.list.useQuery(undefined, {
    enabled: !!me.data,
  });

  const [open, setOpen] = useState<
    | { mode: "create" }
    | { mode: "edit"; service: VendorService }
    | null
  >(null);

  const remove = trpc.vendors.services.delete.useMutation({
    onSuccess: () => {
      toast.success(t("serviceRemovedToast"));
      utils.vendors.services.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (me.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!me.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-2xl border border-brand-line bg-white/80 p-8 backdrop-blur-sm">
          <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            {t("almostThere")}
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight">
            {t("setUpProfileFirst")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("setUpProfileFirstBody")}
          </p>
          <Button
            render={<a href="/dashboard/vendor/profile" />}
            className="mt-4 bg-brand-gradient text-white"
          >
            {tMarketplace("setUpProfile")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
              {t("catalogLabel")}
            </p>
            <h1 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
              {t("yourServices")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("yourServicesSubtitle")}
            </p>
          </div>
          <Button
            onClick={() => setOpen({ mode: "create" })}
            className="w-full gap-1 bg-brand-gradient text-white sm:w-auto"
          >
            <Plus className="size-4" />
            {t("newService")}
          </Button>
        </header>

        {list.isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : (list.data?.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-brand-line bg-white/70 p-12 text-center backdrop-blur-sm">
            <ImageIcon className="mx-auto mb-3 size-8 text-rose-500" />
            <p className="font-display text-xl font-light tracking-tight">
              {t("noServicesYet")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noServicesYetBody")}
            </p>
            <Button
              onClick={() => setOpen({ mode: "create" })}
              className="mt-4 gap-1 bg-brand-gradient text-white"
            >
              <Plus className="size-4" />
              {t("addService")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.data!.map((s) => {
              const imgs = imagesArray(s.images);
              return (
                <div
                  key={s.id}
                  className="overflow-hidden rounded-2xl border border-brand-line bg-white/85 backdrop-blur-sm"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-rose-50">
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
                    {!s.available && (
                      <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-stone-900/80 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
                        <EyeOff className="size-3" />
                        {t("hidden")}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{s.name}</p>
                      <p className="shrink-0 font-mono text-sm tabular-nums text-rose-700">
                        {f.currency(decimalToNumber(s.price_from))}
                      </p>
                    </div>
                    {s.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      {s.subcategory && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-800 ring-1 ring-rose-100">
                          {s.subcategory}
                        </span>
                      )}
                      <span className="rounded-full bg-stone-50 px-2 py-0.5 ring-1 ring-stone-200">
                        {s.price_unit.replace(/_/g, " ")}
                      </span>
                      {s.lead_time_days != null && (
                        <span className="rounded-full bg-stone-50 px-2 py-0.5 ring-1 ring-stone-200">
                          {t("leadDays", { days: s.lead_time_days })}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex justify-end gap-2 border-t border-brand-line pt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        onClick={() =>
                          setOpen({ mode: "edit", service: s as VendorService })
                        }
                      >
                        <Pencil className="size-3.5" />
                        {t("editLabel")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(t("removeServiceConfirm", { name: s.name }))) {
                            remove.mutate({ id: s.id });
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        {t("removeLabel")}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {open?.mode === "edit" ? t("editService") : t("newService")}
              </DialogTitle>
              <DialogDescription>
                {open?.mode === "edit"
                  ? t("editServiceDesc")
                  : t("newServiceDesc")}
              </DialogDescription>
            </DialogHeader>
            {open && (
              <ServiceForm
                mode={open.mode}
                service={open.mode === "edit" ? open.service : null}
                onDone={() => {
                  setOpen(null);
                  utils.vendors.services.list.invalidate();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function ServiceForm({
  mode,
  service,
  onDone,
}: {
  mode: "create" | "edit";
  service: VendorService | null;
  onDone: () => void;
}) {
  const t = useTranslations("vendor");
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [priceFrom, setPriceFrom] = useState<string>(
    service ? String(decimalToNumber(service.price_from)) : "",
  );
  const [priceUnit, setPriceUnit] = useState(service?.price_unit ?? "per_event");
  const [subcategory, setSubcategory] = useState(service?.subcategory ?? "");
  const [leadTime, setLeadTime] = useState<string>(
    service?.lead_time_days != null ? String(service.lead_time_days) : "",
  );
  const [available, setAvailable] = useState(service?.available ?? true);
  const [images, setImages] = useState<string[]>(imagesArray(service?.images));
  const [imageDraft, setImageDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useVendorImageUpload();

  const create = trpc.vendors.services.create.useMutation({
    onSuccess: () => {
      toast.success(t("serviceAddedToast"));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.vendors.services.update.useMutation({
    onSuccess: () => {
      toast.success(t("serviceUpdatedToast"));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const submitting = create.isPending || update.isPending;

  function addImage() {
    const v = imageDraft.trim();
    if (!v) return;
    if (images.includes(v)) {
      setImageDraft("");
      return;
    }
    if (images.length >= 12) {
      toast.error(t("imagesMax"));
      return;
    }
    try {
      // Sanity check that it parses as a URL.
      new URL(v);
    } catch {
      toast.error(t("imageUrlInvalid"));
      return;
    }
    setImages([...images, v]);
    setImageDraft("");
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 12 - images.length;
    if (remaining <= 0) {
      toast.error(t("imagesMax"));
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    const uploaded: string[] = [];
    for (const file of list) {
      const url = await uploadFile(file);
      if (url && !images.includes(url) && !uploaded.includes(url)) {
        uploaded.push(url);
      }
    }
    if (uploaded.length > 0) {
      setImages([...images, ...uploaded]);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceN = Number(priceFrom);
    if (!name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    if (!Number.isFinite(priceN) || priceN < 0) {
      toast.error(t("pricePositive"));
      return;
    }
    const leadN = leadTime.trim() === "" ? null : Number(leadTime);
    if (leadN != null && (!Number.isFinite(leadN) || leadN < 0)) {
      toast.error(t("leadPositive"));
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price_from: priceN,
      price_unit: priceUnit.trim() || "per_event",
      subcategory: subcategory.trim() || null,
      images,
      lead_time_days: leadN as number | null,
      available,
    };
    if (mode === "create") {
      create.mutate(payload);
    } else if (service) {
      update.mutate({ id: service.id, ...payload });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="svc-name">{t("serviceNameLabel")}</Label>
          <Input
            id="svc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("serviceNamePlaceholder")}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="svc-desc">{t("descriptionLabel")}</Label>
          <Textarea
            id="svc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("descriptionPlaceholder")}
            className="resize-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-price">{t("priceFromLabel")}</Label>
          <Input
            id="svc-price"
            type="number"
            inputMode="decimal"
            value={priceFrom}
            onChange={(e) => setPriceFrom(e.target.value)}
            placeholder={t("priceFromPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-unit">{t("priceUnitLabel")}</Label>
          <Input
            id="svc-unit"
            value={priceUnit}
            onChange={(e) => setPriceUnit(e.target.value)}
            placeholder={t("priceUnitPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-sub">{t("subcategoryLabel")}</Label>
          <Input
            id="svc-sub"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            placeholder={t("subcategoryPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-lead">{t("leadTimeLabel")}</Label>
          <Input
            id="svc-lead"
            type="number"
            inputMode="numeric"
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
            placeholder={t("leadTimePlaceholder")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("imagesLabel")}</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <span
              key={img}
              className="group relative inline-flex h-20 w-28 overflow-hidden rounded-lg ring-1 ring-rose-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={t("imagePreviewAlt")} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => setImages(images.filter((i) => i !== img))}
                className="absolute end-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-stone-900/70 text-white opacity-0 transition group-hover:opacity-100"
                aria-label={t("removeImage")}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {images.length < 12 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-rose-200/70 bg-rose-50/30 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50/60 disabled:opacity-60"
            >
              {isUploading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Upload className="size-5" />
                  <span className="text-[11px] font-medium">{t("uploadLabel")}</span>
                </>
              )}
            </button>
          )}
        </div>
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">
            {t("orPasteUrl")}
          </summary>
          <div className="mt-2 flex gap-2">
            <Input
              value={imageDraft}
              onChange={(e) => setImageDraft(e.target.value)}
              placeholder={t("imageUrlPlaceholder")}
            />
            <Button type="button" variant="outline" onClick={addImage} className="gap-1">
              <Plus className="size-3.5" />
              {t("addLabel")}
            </Button>
          </div>
        </details>
        <p className="text-[11px] text-muted-foreground">
          {t("imagesHint")}
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-brand-line bg-white/60 px-4 py-3">
        <span>
          <span className="block text-sm font-medium">{t("visibleToPlanners")}</span>
          <span className="block text-xs text-muted-foreground">
            {t("visibleToPlannersHint")}
          </span>
        </span>
        <input
          type="checkbox"
          className="size-4 accent-rose-600"
          checked={available}
          onChange={(e) => setAvailable(e.target.checked)}
        />
      </label>

      <DialogFooter>
        <Button
          type="submit"
          disabled={submitting}
          className="gap-1 bg-brand-gradient text-white"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {mode === "create" ? t("addToCatalog") : t("saveChanges")}
        </Button>
      </DialogFooter>
    </form>
  );
}
