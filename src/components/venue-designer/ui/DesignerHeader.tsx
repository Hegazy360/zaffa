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
      {/* Row A on mobile: back + title input + inline save status pill;
          same row on desktop. The "My Designs" gallery is a permanent-
          account feature — anon visitors only ever work on the one
          in-progress design we minted for their session, so the back
          button is hidden to keep the flow linear. */}
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        {!isAnon && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-2 text-xs md:h-7 md:px-3"
              onClick={() => router.push("/venue-designer")}
              aria-label={t("myDesigns")}
            >
              <LayoutGrid className="h-4 w-4 md:h-3 md:w-3" />
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

        {/* Save status. Now visible on mobile too — collapsed to a
            single icon (no text) so it doesn't fight the title input
            for space; widens to icon + label from `md` onward. */}
        <div
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
          aria-live="polite"
          aria-label={
            saveStatus === "saving"
              ? t("saving")
              : saveStatus === "saved"
                ? t("saved")
                : t("unsaved")
          }
        >
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin md:h-3 md:w-3" />
              <span className="hidden md:inline">{t("saving")}</span>
            </>
          ) : saveStatus === "saved" ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-500 md:h-3 md:w-3" />
              <span className="hidden md:inline">{t("saved")}</span>
            </>
          ) : (
            <>
              <Circle className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
              <span className="hidden md:inline">{t("unsaved")}</span>
            </>
          )}
        </div>
      </div>

      {/* Row B on mobile: actions wrap; right-aligned cluster on desktop.
          The Vision Pack quota pill gets its own lane on the far end so
          it can't be squeezed into a wrapping line that overlaps the
          name input or the Approve button on mid widths.

          On mobile we bump every button to a 36px (h-9) tap target,
          make the explicit Save button icon-only so it doesn't compete
          with the inline save indicator above, and let the Approve
          CTA stretch to fill any leftover space on its row so it
          remains the obvious primary action. */}
      <div className="flex flex-wrap items-center justify-end gap-1.5 md:ms-auto md:gap-1.5">
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
              className="h-9 gap-1.5 px-2.5 text-xs md:h-7 md:px-3"
              onClick={() => setMediaGalleryOpen(true)}
            >
              <ImageIcon className="h-4 w-4 md:h-3 md:w-3" />
              <span className="hidden sm:inline">{t("gallery")}</span>
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
          className="h-9 gap-1.5 px-2.5 text-xs md:h-7 md:px-3"
          onClick={onSave}
          disabled={saving || saveStatus === "saved"}
          aria-label={t("save")}
        >
          <Save className="h-4 w-4 md:h-3 md:w-3" />
          <span className="hidden md:inline">{t("save")}</span>
        </Button>

        {designId && showApproveCluster &&
          (linkedEventId ? (
            <Button
              size="sm"
              variant="outline"
              className="h-9 flex-1 gap-1.5 border-rose-200 bg-rose-50/60 text-xs text-rose-700 hover:bg-rose-100/70 md:h-7 md:flex-none"
              onClick={() =>
                router.push(`/dashboard/client/event/${linkedEventId}`)
              }
            >
              <ExternalLink className="h-3.5 w-3.5 md:h-3 md:w-3" />
              {t("openEvent")}
            </Button>
          ) : canApprove ? (
            <Button
              size="sm"
              className="h-9 flex-1 gap-1.5 bg-brand-gradient text-xs text-white hover:opacity-90 md:h-7 md:flex-none"
              disabled={createFromDesign.isPending}
              onClick={() => createFromDesign.mutate({ designId })}
            >
              {createFromDesign.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin md:h-3 md:w-3" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 md:h-3 md:w-3" />
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
              className="h-9 flex-1 gap-1.5 border-rose-200/70 bg-background text-xs text-rose-700 hover:bg-rose-50 md:h-7 md:flex-none"
              onClick={() => setUpgradeOpen(true)}
              aria-label={tVp("upgradeApproveTitle")}
            >
              <Lock className="h-3.5 w-3.5 md:h-3 md:w-3" />
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
