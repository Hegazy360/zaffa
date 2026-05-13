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
  Lock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MediaGalleryDialog } from "./MediaGalleryDialog";
import { VisionPackQuotaBadge } from "@/components/vision-pack/VisionPackQuotaBadge";
import { VisionPackUpgradeModal } from "@/components/vision-pack/VisionPackUpgradeModal";
import { useIsAnonymous } from "@/lib/use-is-anonymous";
import { isFreePack } from "@/lib/vision-pack";

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
  const tVp = useTranslations("visionPack");
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  // Three tiers of access for "Approve & create event":
  //   - Anonymous + Free-tier visitors don't see the button at all
  //     — they're still pre-purchase and the paywall is the right
  //     conversion surface, not a planner-matching CTA.
  //   - Design Pack users (paid, but no planner-marketplace access)
  //     see the button rendered in a "locked" style; clicking it
  //     opens the delta-priced Vision Pack upgrade modal instead of
  //     creating an empty event under a tier that can't follow
  //     through with planner matching.
  //   - Vision Pack users see the regular active CTA that fires
  //     `events.createFromDesign`.
  const isAnon = useIsAnonymous();
  const { data: currentPack } = trpc.visionPacks.current.useQuery();
  const onFreeTier = !currentPack || isFreePack(currentPack.sku);
  const onPaidLowerTier =
    !!currentPack && !isFreePack(currentPack.sku) && !currentPack.includes_planner_match;
  const canApprove =
    !isAnon && !onFreeTier && (currentPack?.includes_planner_match ?? false);
  // Show the approve cluster (active or locked) for anyone past the
  // free tier; the locked variant is the conversion hook from Design
  // Pack → Vision Pack.
  const showApproveCluster = !isAnon && (canApprove || onPaidLowerTier);

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
      {/* Row A on mobile: back + title input + save status; same row on desktop.
          The "My Designs" gallery is a permanent-account feature — anon
          visitors only ever work on the one in-progress design we minted
          for their session, so the back button is hidden to keep the
          flow linear. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {!isAnon && (
          <>
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
          </>
        )}

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

      {/* Row B on mobile: actions wrap; right-aligned cluster on desktop.
          The Vision Pack quota pill gets its own lane on the far end so
          it can't be squeezed into a wrapping line that overlaps the
          name input or the Approve button on mid widths. */}
      <div className="flex flex-wrap items-center justify-end gap-2 md:ms-auto md:gap-1.5">
        <VisionPackQuotaBadge />

        <div
          className="hidden h-4 w-px bg-border md:block"
          aria-hidden
        />

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

        {designId && showApproveCluster &&
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
          ) : canApprove ? (
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
          ) : (
            // Design Pack: the active gradient pill would imply the
            // user can actually approve, so we render a subdued
            // outline + lock icon and route the click into the
            // upgrade modal instead.
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-rose-200/70 bg-background text-xs text-rose-700 hover:bg-rose-50 md:h-7 dark:border-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-950/30"
              onClick={() => setUpgradeOpen(true)}
              aria-label={tVp("upgradeApproveTitle")}
            >
              <Lock className="h-3 w-3" />
              {t("approveCreateEvent")}
            </Button>
          ))}
      </div>

      {onPaidLowerTier && (
        <VisionPackUpgradeModal
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          returnPath={
            typeof window !== "undefined"
              ? `${window.location.pathname}${window.location.hash}`
              : undefined
          }
          eyebrow={tVp("upgradeApproveEyebrow")}
          title={tVp("upgradeApproveTitle")}
          body={tVp("upgradeApproveBody")}
        />
      )}
    </div>
  );
}
