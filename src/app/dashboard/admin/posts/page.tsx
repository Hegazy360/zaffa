"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Sparkles, ImageIcon, Wand2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FORMAT_LABELS } from "@/lib/post-generator/formats";
import { GeneratePostModal } from "./_components/GeneratePostModal";
import type { HydratedPost, PostStatusId } from "@/types/posts";

type ListTab = "pending" | "published" | "discarded" | "all";

const TAB_LABELS: Record<ListTab, string> = {
  pending: "Pending",
  published: "Published",
  discarded: "Discarded",
  all: "All",
};

const STATUS_PILL: Record<PostStatusId, string> = {
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  published: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  discarded: "bg-stone-200 text-stone-600 ring-stone-300",
};

export default function AdminPostsPage() {
  const [tab, setTab] = useState<ListTab>("pending");
  const [generateOpen, setGenerateOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.adminPosts.list.useQuery({
    status: tab,
    limit: 50,
  });

  const posts = useMemo(() => data?.posts ?? [], [data]);

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-16">
        <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 sm:space-y-3">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
              Social
            </p>
            <h1 className="font-display text-balance text-3xl font-light leading-tight tracking-tight sm:text-4xl">
              Posts
            </h1>
            <p className="max-w-xl text-xs text-muted-foreground sm:text-sm">
              Generated Instagram / TikTok carousels, awaiting triage.
              Publishing here is a status flip — actual posting still
              happens manually from a phone.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setGenerateOpen(true)}
            className="h-10 w-full gap-1.5 bg-brand-gradient text-white hover:opacity-90 sm:h-9 sm:w-auto"
          >
            <Wand2 className="size-3.5" />
            Generate new post
          </Button>
        </header>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as ListTab)}
          className="mb-6"
        >
          <TabsList variant="line">
            {(Object.keys(TAB_LABELS) as ListTab[]).map((id) => (
              <TabsTrigger key={id} value={id}>
                {TAB_LABELS[id]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <section className="rounded-2xl border border-brand-line bg-white/80 p-1.5 backdrop-blur-sm sm:p-2 dark:border-rose-900/30 dark:bg-card/80">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-rose-500" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Sparkles className="size-6 text-rose-400" />
              <p className="font-display text-lg font-medium tracking-tight">
                No {tab === "all" ? "posts" : `${tab} posts`} yet
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                Click <em>Generate new post</em> to create one. The pipeline
                pulls inspiration, generates renders, writes the caption,
                and stages a carousel for you to triage.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-rose-100/70 dark:divide-rose-900/30">
              {posts.map((post) => (
                <li key={post.id}>
                  <PostRow post={post} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <GeneratePostModal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onCreated={() => {
          utils.adminPosts.list.invalidate();
          toast.success("Post generated");
        }}
      />
    </div>
  );
}

function PostRow({ post }: { post: HydratedPost }) {
  const firstSlideThumb = post.slides[0]?.rendered_png_url ?? null;
  const fallbackImage =
    post.render_image_urls[0] ?? post.inspiration_image_urls[0] ?? null;

  return (
    <Link
      href={`/dashboard/admin/posts/${post.id}`}
      className="flex items-center gap-3 px-2.5 py-2.5 text-sm transition-colors hover:bg-rose-50/40 sm:gap-4 sm:px-3 sm:py-3 dark:hover:bg-rose-950/20"
    >
      <div className="relative grid h-16 w-[3.2rem] shrink-0 place-items-center overflow-hidden rounded-md bg-stone-100 ring-1 ring-foreground/[0.04] sm:h-20 sm:w-16">
        {firstSlideThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={firstSlideThumb}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : fallbackImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fallbackImage}
            alt=""
            className="h-full w-full object-cover opacity-70"
          />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-stone-700 ring-1 ring-stone-200 sm:text-[10px]">
            {FORMAT_LABELS[post.format]}
          </span>
          <span className="font-display text-sm lowercase tracking-wide">
            {post.vibe}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:truncate sm:line-clamp-none">
          {post.caption.split("\n")[0]}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.18em] ring-1 sm:text-[10px]",
            STATUS_PILL[post.status],
          )}
        >
          {post.status}
        </span>
        <time className="text-[10px] text-muted-foreground" dateTime={post.created_at.toISOString()}>
          {new Date(post.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </time>
      </div>
    </Link>
  );
}
