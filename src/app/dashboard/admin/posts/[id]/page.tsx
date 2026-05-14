"use client";

import { use, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SLIDE_DIMENSIONS } from "@/types/posts";
import { RenderSlideRecord } from "@/components/admin/post-generator/slides/registry";
import { rasterizeAndUpload } from "@/components/admin/post-generator/rasterize";
import { IGCarouselPreview } from "./_components/IGCarouselPreview";
import { PostMetadataSidebar } from "./_components/PostMetadataSidebar";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminPostDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const { data: post, isLoading } = trpc.adminPosts.get.useQuery({ id });

  const [isRasterizing, setIsRasterizing] = useState(false);
  const [regenIndices, setRegenIndices] = useState<Set<number>>(new Set());
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const attachMutation = trpc.adminPosts.attachRasterizedSlide.useMutation();
  const regenMutation = trpc.adminPosts.regenerateSlide.useMutation({
    onSuccess: () => {
      utils.adminPosts.get.invalidate({ id });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRasterizeAll = useCallback(async () => {
    if (!post) return;
    setIsRasterizing(true);
    let okCount = 0;
    let failCount = 0;
    try {
      for (let i = 0; i < post.slides.length; i++) {
        const el = slideRefs.current.get(i);
        if (!el) continue;
        try {
          const { pngUrl } = await rasterizeAndUpload(el);
          await attachMutation.mutateAsync({
            post_id: post.id,
            slide_index: i,
            png_url: pngUrl,
          });
          okCount += 1;
          // Refetch after each slide so the UI (carousel "rendered"
          // badge + Download button counter) updates progressively.
          await utils.adminPosts.get.invalidate({ id: post.id });
        } catch (err) {
          failCount += 1;
          console.error(`Slide ${i + 1} rasterization failed`, err);
          toast.error(
            `Slide ${i + 1} failed: ${err instanceof Error ? err.message : "unknown error"}`,
          );
        }
      }
      if (failCount === 0) {
        toast.success(`${okCount} slide${okCount === 1 ? "" : "s"} rendered to HD`);
      } else if (okCount > 0) {
        toast.warning(`${okCount} ok, ${failCount} failed — see console`);
      }
    } finally {
      setIsRasterizing(false);
    }
  }, [post, attachMutation, utils]);

  const handleRegenerateSlide = useCallback(
    async (slideIndex: number) => {
      if (!post) return;
      setRegenIndices((prev) => new Set(prev).add(slideIndex));
      try {
        await regenMutation.mutateAsync({
          post_id: post.id,
          slide_index: slideIndex,
        });
        toast.success(`Slide ${slideIndex + 1} regenerated`);
      } finally {
        setRegenIndices((prev) => {
          const next = new Set(prev);
          next.delete(slideIndex);
          return next;
        });
      }
    },
    [post, regenMutation],
  );

  const rasterizedUrls = useMemo(
    () => post?.slides.map((s) => s.rendered_png_url ?? "") ?? [],
    [post?.slides],
  );

  if (isLoading || !post) {
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link
            href="/dashboard/admin/posts"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to posts
          </Link>
        </div>

        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="flex flex-col items-center">
            <IGCarouselPreview
              slides={post.slides}
              onRegenerateSlide={handleRegenerateSlide}
              regeneratingIndices={regenIndices}
            />
          </div>

          <PostMetadataSidebar
            post={post}
            onRasterizeAll={handleRasterizeAll}
            isRasterizing={isRasterizing}
            rasterizedUrls={rasterizedUrls}
          />
        </div>
      </div>

      {/*
        Hidden full-size mount of every slide. The rasterizer reads from
        these refs (not from the scaled preview) so html-to-image gets
        unmodified 1080x1350 DOM. Pinning to `left: -10000` keeps the
        offscreen content out of the visible viewport without
        `display: none` (which would make html-to-image snapshot a
        zero-size element).
      */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: SLIDE_DIMENSIONS.width,
          height: SLIDE_DIMENSIONS.height * post.slides.length,
          pointerEvents: "none",
        }}
      >
        {post.slides.map((slide, i) => (
          <div
            key={i}
            ref={(el) => {
              if (el) slideRefs.current.set(i, el);
              else slideRefs.current.delete(i);
            }}
            style={{
              width: SLIDE_DIMENSIONS.width,
              height: SLIDE_DIMENSIONS.height,
            }}
          >
            <RenderSlideRecord record={slide} />
          </div>
        ))}
      </div>
    </div>
  );
}
