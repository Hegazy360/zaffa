"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Wand2, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_FORMAT_IDS,
  FORMAT_LABELS,
} from "@/lib/post-generator/formats";
import type { PostFormatId } from "@/types/posts";

interface GeneratePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function GeneratePostModal({
  open,
  onOpenChange,
  onCreated,
}: GeneratePostModalProps) {
  const [format, setFormat] = useState<PostFormatId | "auto">("auto");
  const [vibe, setVibe] = useState("");

  const generate = trpc.adminPosts.generate.useMutation({
    onSuccess: () => {
      onCreated?.();
      onOpenChange(false);
      setVibe("");
      setFormat("auto");
    },
    onError: (err) => {
      toast.error(err.message ?? "Generation failed");
    },
  });

  const submit = (overrides?: { surprise?: boolean }) => {
    generate.mutate({
      format:
        overrides?.surprise || format === "auto" ? undefined : format,
      vibe: overrides?.surprise ? undefined : vibe.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate a new post</DialogTitle>
          <DialogDescription>
            Pick a format and vibe, or leave both blank and let the
            generator surprise you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="gen-format">Format</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as PostFormatId | "auto")}
            >
              <SelectTrigger id="gen-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">auto-pick (recommended)</SelectItem>
                {ALL_FORMAT_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {FORMAT_LABELS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gen-vibe">Vibe</Label>
            <Input
              id="gen-vibe"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="e.g. tuscan garden, cairo rooftop"
            />
            <p className="text-[11px] text-muted-foreground">
              Leave blank to auto-pick (MENA-weighted).
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => submit({ surprise: true })}
            disabled={generate.isPending}
            className="gap-1.5"
          >
            <Sparkles className="size-3.5" />
            Surprise me
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={generate.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => submit()}
              disabled={generate.isPending}
              className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
            >
              {generate.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
              Generate
            </Button>
          </div>
        </div>

        {generate.isPending && (
          <p className="text-center text-[11px] text-muted-foreground">
            this takes 30-60 seconds (pinterest + image-gen + caption)
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
