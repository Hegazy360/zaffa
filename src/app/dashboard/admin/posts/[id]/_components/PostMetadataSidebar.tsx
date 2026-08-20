"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Camera,
  CheckCircle2,
  Trash2,
  Download,
  X,
  Plus,
  Copy,
  Check,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FORMAT_LABELS } from "@/lib/post-generator/formats";
import type { HydratedPost, NamedColor, NamedPalette } from "@/types/posts";

interface PostMetadataSidebarProps {
  post: HydratedPost;
  /** Called when "Render to HD" is clicked. Parent owns the rasterizer. */
  onRasterizeAll: () => void;
  /** True while parent is rasterizing. */
  isRasterizing: boolean;
  /** Cloudinary URL list of rasterized PNGs (for the .zip download). */
  rasterizedUrls: string[];
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function PostMetadataSidebar({
  post,
  onRasterizeAll,
  isRasterizing,
  rasterizedUrls,
}: PostMetadataSidebarProps) {
  const utils = trpc.useUtils();

  // Local copy so the user can edit before saving. Re-seeded whenever
  // the post id changes (navigating between posts).
  const [vibe, setVibe] = useState(post.vibe);
  const [paletteName, setPaletteName] = useState(post.palette.name);
  const [colors, setColors] = useState<NamedColor[]>(post.palette.colors);
  const [partnerA, setPartnerA] = useState(post.couple_names.partner_a);
  const [partnerB, setPartnerB] = useState(post.couple_names.partner_b);
  const [caption, setCaption] = useState(post.caption);
  const [hashtags, setHashtags] = useState<string[]>(post.hashtags);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    setVibe(post.vibe);
    setPaletteName(post.palette.name);
    setColors(post.palette.colors);
    setPartnerA(post.couple_names.partner_a);
    setPartnerB(post.couple_names.partner_b);
    setCaption(post.caption);
    setHashtags(post.hashtags);
  }, [post.id, post.vibe, post.palette, post.couple_names, post.caption, post.hashtags]);

  const updateMeta = trpc.adminPosts.updateMeta.useMutation({
    onSuccess: () => {
      utils.adminPosts.get.invalidate({ id: post.id });
      utils.adminPosts.list.invalidate();
      toast.success("Saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStatus = trpc.adminPosts.updateStatus.useMutation({
    onSuccess: () => {
      utils.adminPosts.get.invalidate({ id: post.id });
      utils.adminPosts.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSaveMeta = () => {
    if (!HEX_RE.test) return; // tsc happy
    if (colors.length !== 5 || colors.some((c) => !HEX_RE.test(c.hex))) {
      toast.error("Palette must have 5 valid hex colors");
      return;
    }
    if (hashtags.length !== 5) {
      toast.error("Need exactly 5 hashtags");
      return;
    }
    const palette: NamedPalette = {
      name: paletteName.trim(),
      colors: colors.map((c) => ({
        name: c.name.trim() || c.hex.toLowerCase(),
        hex: c.hex.toUpperCase(),
      })),
    };
    updateMeta.mutate({
      id: post.id,
      vibe: vibe.trim(),
      palette,
      couple_names: { partner_a: partnerA.trim(), partner_b: partnerB.trim() },
      caption: caption.trim(),
      hashtags,
    });
  };

  const addHashtag = () => {
    const t = hashtagDraft
      .trim()
      .toLowerCase()
      .replace(/^#/, "")
      .replace(/[^a-z0-9]/g, "");
    if (!t) return;
    if (hashtags.includes(t)) return;
    if (hashtags.length >= 5) {
      toast.error("Max 5 hashtags");
      return;
    }
    setHashtags([...hashtags, t]);
    setHashtagDraft("");
  };

  const removeHashtag = (idx: number) => {
    setHashtags(hashtags.filter((_, i) => i !== idx));
  };

  // Copies the caption followed by a blank line and the hashtags, e.g.
  //   golden hour, slow morning, jasmine air ✨
  //
  //   #weddinginspo #tuscanwedding #moodboard #editorial #zaffa
  // Operates on the live (possibly unsaved) values so the user can
  // tweak in-place and copy without an intermediate Save round-trip.
  const handleCopyCaption = async () => {
    const tags = hashtags.map((t) => `#${t}`).join(" ");
    const text = tags ? `${caption.trim()}\n\n${tags}` : caption.trim();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts (older browsers / http://).
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setJustCopied(true);
      toast.success("Caption + hashtags copied");
      window.setTimeout(() => setJustCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed", err);
      toast.error("Copy failed — clipboard blocked by browser");
    }
  };

  const handleDownloadZip = async () => {
    const ready = rasterizedUrls.filter(Boolean);
    if (ready.length === 0) {
      toast.error("Nothing rasterized yet — click Render to HD first");
      return;
    }
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    await Promise.all(
      ready.map(async (url, i) => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          zip.file(`slide-${i + 1}.png`, blob);
        } catch (err) {
          console.error("Failed to bundle slide", i, err);
        }
      }),
    );
    const out = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(out);
    a.download = `zaffa-post-${post.id.slice(0, 8)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const rasterizedCount = post.slides.filter(
    (s) => s.rendered_png_url !== null,
  ).length;

  return (
    <aside className="space-y-4 sm:space-y-6">
      <section className="rounded-2xl border border-brand-line bg-white/80 p-3 shadow-sm backdrop-blur-sm sm:p-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-stone-700 ring-1 ring-stone-200">
              {FORMAT_LABELS[post.format]}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] ring-1",
                post.status === "pending"
                  ? "bg-amber-100 text-amber-800 ring-amber-200"
                  : post.status === "published"
                    ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                    : "bg-stone-200 text-stone-600 ring-stone-300",
              )}
            >
              {post.status}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vibe">Vibe</Label>
            <Input
              id="vibe"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="Tuscan Garden"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Palette</Label>
            <Input
              value={paletteName}
              onChange={(e) => setPaletteName(e.target.value)}
              placeholder="palette name"
              className="text-sm"
            />
            <ul className="space-y-1.5">
              {colors.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span
                    className="size-6 rounded-full ring-1 ring-foreground/10"
                    style={{ backgroundColor: HEX_RE.test(c.hex) ? c.hex : "#cccccc" }}
                  />
                  <Input
                    value={c.name}
                    onChange={(e) => {
                      const next = colors.slice();
                      next[i] = { ...next[i], name: e.target.value };
                      setColors(next);
                    }}
                    placeholder="name"
                    className="h-8 flex-1 text-xs"
                  />
                  <Input
                    value={c.hex}
                    onChange={(e) => {
                      const next = colors.slice();
                      next[i] = { ...next[i], hex: e.target.value };
                      setColors(next);
                    }}
                    placeholder="#A1B2C3"
                    className="h-8 w-[88px] font-mono text-xs"
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="partner-a">Partner A</Label>
              <Input
                id="partner-a"
                value={partnerA}
                onChange={(e) => setPartnerA(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="partner-b">Partner B</Label>
              <Input
                id="partner-b"
                value={partnerB}
                onChange={(e) => setPartnerB(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="caption">Caption</Label>
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {caption.length} chars
                </span>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  disabled={!caption.trim() && hashtags.length === 0}
                  title="Copy caption + hashtags"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors",
                    "text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50 hover:text-stone-900",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    justCopied && "bg-emerald-50 text-emerald-700 ring-emerald-200",
                  )}
                >
                  {justCopied ? (
                    <>
                      <Check className="size-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="text-xs leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Hashtags ({hashtags.length}/5)</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {hashtags.map((tag, i) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 py-0.5 ps-2 pe-1 text-xs ring-1 ring-rose-200"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeHashtag(i)}
                    className="rounded-full p-0.5 text-stone-500 hover:bg-rose-100 hover:text-stone-800"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={hashtagDraft}
                onChange={(e) => setHashtagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
                placeholder="weddinginspo"
                className="h-8 flex-1 text-xs"
                disabled={hashtags.length >= 5}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addHashtag}
                disabled={!hashtagDraft.trim() || hashtags.length >= 5}
                className="h-8 gap-1"
              >
                <Plus className="size-3" />
                Add
              </Button>
            </div>
          </div>

          <Button
            onClick={handleSaveMeta}
            disabled={updateMeta.isPending}
            className="h-10 w-full gap-1.5 bg-rose-500 text-white hover:bg-rose-600"
          >
            {updateMeta.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            Save changes
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-brand-line bg-white/80 p-3 shadow-sm backdrop-blur-sm sm:p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.3em] text-rose-700/85">
          Actions
        </p>
        <div className="space-y-2">
          <Button
            onClick={onRasterizeAll}
            disabled={isRasterizing}
            className="h-10 w-full gap-1.5 bg-brand-gradient text-white hover:opacity-90"
          >
            {isRasterizing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Camera className="size-3.5" />
            )}
            Render to HD
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadZip}
            disabled={rasterizedCount === 0 || isRasterizing}
            className="h-10 w-full gap-1.5"
          >
            <Download className="size-3.5" />
            Download {rasterizedCount}/{post.slides.length} PNGs (.zip)
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              updateStatus.mutate({ id: post.id, status: "published" })
            }
            disabled={updateStatus.isPending || post.status === "published"}
            className="h-10 w-full gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            <CheckCircle2 className="size-3.5" />
            Publish
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(
                  "Discard this post? It'll move to the discarded tab and stop appearing in pending.",
                )
              ) {
                updateStatus.mutate({ id: post.id, status: "discarded" });
              }
            }}
            disabled={updateStatus.isPending || post.status === "discarded"}
            className="h-10 w-full gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Discard
          </Button>
        </div>
      </section>
    </aside>
  );
}
