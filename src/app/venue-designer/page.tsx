"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Trash2, Pencil, Image as ImageIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function VenueDesignerGalleryPage() {
  const router = useRouter();
  const { data: designs, isLoading } = trpc.venueDesigns.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.venueDesigns.delete.useMutation({
    onSuccess: () => utils.venueDesigns.list.invalidate(),
  });

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Designs</h1>
            <p className="text-muted-foreground mt-1">
              Create and manage your venue layouts
            </p>
          </div>
          <Button
            onClick={() => router.push("/venue-designer/new")}
            className="gap-2 bg-rose-500 hover:bg-rose-600 text-white"
          >
            <Plus className="h-4 w-4" />
            New Design
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
          </div>
        ) : !designs || designs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <Pencil className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No designs yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Start a new design. Pick a few inspiration images for each part
              of your event and we&apos;ll bring it to life with AI.
            </p>
            <Button
              onClick={() => router.push("/venue-designer/new")}
              className="gap-2 bg-rose-500 hover:bg-rose-600 text-white"
            >
              <Plus className="h-4 w-4" />
              Create Your First Design
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {designs.map((design) => (
              <div
                key={design.id}
                className="group relative rounded-xl border bg-card overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => router.push(`/venue-designer/${design.id}`)}
              >
                <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                  {design.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={design.thumbnail}
                      alt={design.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Pencil className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-sm truncate">
                        {design.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {design.size} {design.setting} {design.event_type}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span>
                          {formatDistanceToNow(new Date(design.updated_at), {
                            addSuffix: true,
                          })}
                        </span>
                        {design._count.media > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <ImageIcon className="h-3 w-3" />
                            {design._count.media}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(design.id, design.name);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
