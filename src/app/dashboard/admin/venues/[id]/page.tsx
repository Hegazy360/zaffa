"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface VenueFormState {
  name: string;
  slug: string;
  description: string;
  country: string;
  city: string;
  address: string;
  capacity_min: string;
  capacity_max: string;
  price_tier: string;
  styles: string;
  amenities: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  cover_image: string;
  published: boolean;
}

const EMPTY_FORM: VenueFormState = {
  name: "",
  slug: "",
  description: "",
  country: "EG",
  city: "",
  address: "",
  capacity_min: "",
  capacity_max: "",
  price_tier: "",
  styles: "",
  amenities: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  website: "",
  cover_image: "",
  published: true,
};

/**
 * Single-page editor for a venue. Handles both create (`/new`) and
 * update (`/<id>`) — the route param drives the mode. After a
 * successful create, we navigate to the freshly-created venue's
 * editor URL so the photo manager works without a full page reload.
 *
 * Photo management uses `/api/admin/venues/upload-image` to push the
 * blob to Cloudinary and `venues.adminAddImage` to record the URL on
 * the venue. Removing an image just calls `adminRemoveImage` — we
 * don't bother purging Cloudinary, since orphaned media has no PII
 * and is cheap.
 */
export default function AdminVenueEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const id = params.id === "new" ? null : params.id;

  const { data: venue, isLoading } = trpc.venues.adminGet.useQuery(
    { id: id ?? "" },
    { enabled: !!id },
  );

  const [form, setForm] = useState<VenueFormState>(EMPTY_FORM);
  // Re-seed the form whenever a fresh venue id loads.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!venue) return;
    if (hydratedFor === venue.id) return;
    setHydratedFor(venue.id);
    setForm({
      name: venue.name,
      slug: venue.slug,
      description: venue.description ?? "",
      country: venue.country,
      city: venue.city,
      address: venue.address ?? "",
      capacity_min: venue.capacity_min?.toString() ?? "",
      capacity_max: venue.capacity_max?.toString() ?? "",
      price_tier: venue.price_tier ?? "",
      styles: Array.isArray(venue.styles)
        ? (venue.styles as string[]).join(", ")
        : "",
      amenities: Array.isArray(venue.amenities)
        ? (venue.amenities as string[]).join(", ")
        : "",
      contact_name: venue.contact_name ?? "",
      contact_email: venue.contact_email ?? "",
      contact_phone: venue.contact_phone ?? "",
      website: venue.website ?? "",
      cover_image: venue.cover_image ?? "",
      published: venue.published,
    });
  }, [venue, hydratedFor]);

  const create = trpc.venues.adminCreate.useMutation({
    onSuccess: (created) => {
      utils.venues.adminList.invalidate();
      toast.success("Venue created");
      router.push(`/dashboard/admin/venues/${created.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.venues.adminUpdate.useMutation({
    onSuccess: () => {
      utils.venues.adminList.invalidate();
      utils.venues.adminGet.invalidate({ id: id ?? "" });
      toast.success("Saved");
    },
    onError: (e) => toast.error(e.message),
  });

  function buildPayload() {
    return {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      description: form.description.trim() || null,
      country: form.country.trim().toUpperCase(),
      city: form.city.trim(),
      address: form.address.trim() || null,
      capacity_min: form.capacity_min ? Number(form.capacity_min) : null,
      capacity_max: form.capacity_max ? Number(form.capacity_max) : null,
      price_tier: form.price_tier.trim() || null,
      styles: form.styles
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      amenities: form.amenities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      website: form.website.trim() || null,
      cover_image: form.cover_image.trim() || null,
      published: form.published,
    };
  }

  const handleSave = () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!/^[A-Z]{2}$/.test(form.country.trim().toUpperCase()))
      return toast.error("Country must be a 2-letter ISO code");
    if (!form.city.trim()) return toast.error("City is required");
    if (
      form.capacity_min &&
      form.capacity_max &&
      Number(form.capacity_min) > Number(form.capacity_max)
    ) {
      return toast.error("Min capacity can't exceed max capacity");
    }
    const payload = buildPayload();
    if (id) {
      update.mutate({ id, ...payload });
    } else {
      create.mutate(payload);
    }
  };

  if (id && isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Button
            render={<Link href="/dashboard/admin/venues" />}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
          >
            <ArrowLeft className="size-3.5" />
            All venues
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={create.isPending || update.isPending}
            className="h-8 gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
          >
            {create.isPending || update.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            {id ? "Save changes" : "Create venue"}
          </Button>
        </div>

        <h1 className="font-display mb-6 text-3xl font-light tracking-tight">
          {id ? form.name || "Untitled venue" : "New venue"}
        </h1>

        <div className="space-y-8">
          <Section title="Basics">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field
              label="Slug"
              hint="URL-safe handle. Auto-derived from name if left blank."
            >
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                placeholder="garden-house-cairo"
                className="font-mono"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
              />
            </Field>
            <div className="flex items-start justify-between gap-3 rounded-md border border-rose-100/70 bg-white/60 p-3 dark:border-rose-900/30 dark:bg-card/60">
              <Label htmlFor="published" className="text-sm">
                Published
                <p className="text-[11px] font-normal text-muted-foreground">
                  Hidden venues are excluded from search & recommendations.
                </p>
              </Label>
              <Button
                id="published"
                type="button"
                size="sm"
                variant={form.published ? "default" : "outline"}
                onClick={() =>
                  setForm({ ...form, published: !form.published })
                }
                className="h-7 gap-1.5 text-xs"
              >
                {form.published ? "Live" : "Hidden"}
              </Button>
            </div>
          </Section>

          <Section title="Location">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country (ISO-2)" required>
                <Input
                  value={form.country}
                  onChange={(e) =>
                    setForm({ ...form, country: e.target.value.toUpperCase() })
                  }
                  maxLength={2}
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="City" required>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Address">
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
          </Section>

          <Section title="Capacity & vibe">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Min guests">
                <Input
                  value={form.capacity_min}
                  onChange={(e) =>
                    setForm({ ...form, capacity_min: e.target.value })
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field label="Max guests">
                <Input
                  value={form.capacity_max}
                  onChange={(e) =>
                    setForm({ ...form, capacity_max: e.target.value })
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field label="Price tier" hint="$, $$, $$$, …">
                <Input
                  value={form.price_tier}
                  onChange={(e) =>
                    setForm({ ...form, price_tier: e.target.value })
                  }
                  maxLength={8}
                />
              </Field>
            </div>
            <Field
              label="Styles"
              hint="Comma-separated tags (e.g. garden, ballroom, rooftop)."
            >
              <Input
                value={form.styles}
                onChange={(e) => setForm({ ...form, styles: e.target.value })}
              />
            </Field>
            <Field
              label="Amenities"
              hint="Comma-separated (e.g. parking, indoor, accommodation)."
            >
              <Input
                value={form.amenities}
                onChange={(e) =>
                  setForm({ ...form, amenities: e.target.value })
                }
              />
            </Field>
          </Section>

          <Section title="Contact">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact name">
                <Input
                  value={form.contact_name}
                  onChange={(e) =>
                    setForm({ ...form, contact_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Email">
                <Input
                  value={form.contact_email}
                  type="email"
                  onChange={(e) =>
                    setForm({ ...form, contact_email: e.target.value })
                  }
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.contact_phone}
                  onChange={(e) =>
                    setForm({ ...form, contact_phone: e.target.value })
                  }
                />
              </Field>
              <Field label="Website">
                <Input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://"
                />
              </Field>
            </div>
          </Section>

          <Section title="Cover image">
            <Field
              label="Cover image URL"
              hint="Used as the card hero on the couple's event page."
            >
              <Input
                value={form.cover_image}
                onChange={(e) =>
                  setForm({ ...form, cover_image: e.target.value })
                }
                placeholder="https://res.cloudinary.com/…"
              />
            </Field>
            {form.cover_image ? (
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md border bg-muted">
                <Image
                  src={form.cover_image}
                  alt={form.name || "Cover"}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            ) : null}
          </Section>

          {id ? (
            <Section title="Photo gallery">
              <PhotoManager venueId={id} />
            </Section>
          ) : (
            <p className="text-xs text-muted-foreground">
              Save the venue first, then add gallery photos.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="space-y-3 rounded-2xl border border-rose-100/70 bg-white/80 p-5 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-700/80">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, hint, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required ? <span className="ms-1 text-rose-600">*</span> : null}
      </Label>
      {children}
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function PhotoManager({ venueId }: { venueId: string }) {
  const utils = trpc.useUtils();
  const { data: venue } = trpc.venues.adminGet.useQuery({ id: venueId });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addImage = trpc.venues.adminAddImage.useMutation({
    onSuccess: () => {
      utils.venues.adminGet.invalidate({ id: venueId });
      toast.success("Photo added");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeImage = trpc.venues.adminRemoveImage.useMutation({
    onSuccess: () => {
      utils.venues.adminGet.invalidate({ id: venueId });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/venues/upload-image", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Upload failed");
        return;
      }
      addImage.mutate({
        venue_id: venueId,
        url: json.url,
        alt: file.name.replace(/\.[^.]+$/, ""),
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const images = venue?.images ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((img) => (
          <div
            key={img.id}
            className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
          >
            <Image
              src={img.url}
              alt={img.alt ?? ""}
              fill
              sizes="(min-width: 640px) 33vw, 50vw"
              className="object-cover"
            />
            <button
              type="button"
              onClick={() => removeImage.mutate({ id: img.id })}
              className="absolute end-1 top-1 grid size-7 place-items-center rounded-full bg-white/95 text-destructive opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              aria-label="Remove photo"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <label
          className="flex aspect-square cursor-pointer items-center justify-center rounded-md border border-dashed border-rose-200 text-xs text-muted-foreground transition hover:border-rose-400 hover:text-rose-700"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          {uploading ? (
            <Loader2 className="size-5 animate-spin text-rose-500" />
          ) : (
            <span className="flex flex-col items-center gap-1">
              <UploadCloud className="size-5" />
              Add photo
            </span>
          )}
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        JPG, PNG, or WebP, up to 8MB. The first image becomes the gallery
        cover; the cover image set above is used on cards.
      </p>
      {images.length === 0 ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => fileRef.current?.click()}
        >
          <Plus className="size-3" />
          Upload first photo
        </Button>
      ) : null}
    </div>
  );
}
