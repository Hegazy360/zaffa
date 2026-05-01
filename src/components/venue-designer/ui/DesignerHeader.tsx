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
    <div className="flex items-center gap-3 rounded-xl border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => router.push("/venue-designer")}
      >
        <LayoutGrid className="h-3 w-3" />
        {t("myDesigns")}
      </Button>

      <div className="h-4 w-px bg-border" />

      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="w-48 border-none bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
        placeholder={t("designNamePlaceholder")}
      />

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
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

      <div className="ms-auto flex items-center gap-1">
        {designId && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
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
          className="h-7 gap-1.5 text-xs"
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
              className="h-7 gap-1.5 border-rose-200 bg-rose-50/60 text-xs text-rose-700 hover:bg-rose-100/70"
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
              className="h-7 gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-xs text-white hover:opacity-90"
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
