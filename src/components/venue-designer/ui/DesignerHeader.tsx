"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Save,
  LayoutGrid,
  Check,
  Loader2,
  Circle,
  Image as ImageIcon,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MediaGalleryDialog } from "./MediaGalleryDialog";

interface DesignerHeaderProps {
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  saving: boolean;
  saveStatus: "saved" | "saving" | "unsaved";
  designId?: string;
}

export function DesignerHeader({
  name,
  onNameChange,
  onSave,
  saving,
  saveStatus,
  designId,
}: DesignerHeaderProps) {
  const router = useRouter();
  const t = useTranslations("designer");
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);

  // Look up which event (if any) this design is already attached to so we
  // can show "Open event" instead of "Approve & create event".
  const { data: design } = trpc.venueDesigns.getById.useQuery(
    { id: designId ?? "" },
    { enabled: Boolean(designId) }
  );
  const linkedEventId = design?.event_id ?? null;

  const utils = trpc.useUtils();
  const createFromDesign = trpc.events.createFromDesign.useMutation({
    onSuccess: (event) => {
      toast.success(t("createdToast"));
      utils.events.list.invalidate();
      utils.venueDesigns.list.invalidate();
      if (designId) utils.venueDesigns.getById.invalidate({ id: designId });
      router.push(`/dashboard/client/event/${event.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-background/90 px-3 py-2 shadow-sm backdrop-blur-sm md:flex-row md:items-center md:gap-3 md:py-1.5">
      {/* Row A on mobile: back + title input + save status; same row on desktop */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 text-xs md:h-7"
          onClick={() => router.push("/venue-designer")}
        >
          <LayoutGrid className="h-3 w-3" />
          <span className="hidden sm:inline">{t("myDesigns")}</span>
        </Button>

        <div className="hidden h-4 w-px bg-border md:block" />

        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="min-w-0 flex-1 border-none bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground md:w-48 md:flex-none"
          placeholder={t("designNamePlaceholder")}
        />

        <div className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{t("saving")}</span>
            </>
          ) : saveStatus === "saved" ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span>{t("saved")}</span>
            </>
          ) : (
            <>
              <Circle className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
              <span>{t("unsaved")}</span>
            </>
          )}
        </div>
      </div>

      {/* Row B on mobile: actions wrap; right-aligned cluster on desktop */}
      <div className="flex flex-wrap items-center justify-end gap-2 md:ms-auto md:gap-1">
        {designId && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs md:h-7"
              onClick={() => setMediaGalleryOpen(true)}
            >
              <ImageIcon className="h-3 w-3" />
              {t("gallery")}
            </Button>
            <MediaGalleryDialog
              open={mediaGalleryOpen}
              onOpenChange={setMediaGalleryOpen}
              designId={designId}
            />
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs md:h-7"
          onClick={onSave}
          disabled={saving || saveStatus === "saved"}
        >
          <Save className="h-3 w-3" />
          {t("save")}
        </Button>

        {designId &&
          (linkedEventId ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-rose-200 bg-rose-50/60 text-xs text-rose-700 hover:bg-rose-100/70 md:h-7"
              onClick={() =>
                router.push(`/dashboard/client/event/${linkedEventId}`)
              }
            >
              <ExternalLink className="h-3 w-3" />
              {t("openEvent")}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-xs text-white hover:opacity-90 md:h-7"
              disabled={createFromDesign.isPending}
              onClick={() => createFromDesign.mutate({ designId })}
            >
              {createFromDesign.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {t("approveCreateEvent")}
            </Button>
          ))}
      </div>
    </div>
  );
}
