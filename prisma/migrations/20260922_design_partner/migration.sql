-- Design partner release (docs/plan-design-partner-2026-09.md, F0).
--
-- Applied surgically per prisma/migrations/README.md (ZAF-71): every
-- statement is additive and idempotent, nothing touches the pre-existing
-- drift on vision_packs timestamps. Tables venue_designs,
-- venue_design_media and vision_packs were dumped to JSON before this ran.

-- F1: the couple's own venue photo, kept out of `references` so it can
-- never leak into moodboards, microsites or share pages by accident.
ALTER TABLE venue_designs ADD COLUMN IF NOT EXISTS venue_photo jsonb;

-- F5: the render version the couple chose. Enquiry, lookbook and the admin
-- brief pin to it instead of guessing "latest".
ALTER TABLE venue_designs ADD COLUMN IF NOT EXISTS selected_media_id uuid;

-- F0: per-render provenance (mode, model, cost, refine instruction, cached
-- decor analysis).
ALTER TABLE venue_design_media ADD COLUMN IF NOT EXISTS meta jsonb;
CREATE INDEX IF NOT EXISTS venue_design_media_design_id_created_at_idx
  ON venue_design_media (design_id, created_at);
CREATE INDEX IF NOT EXISTS venue_design_media_parent_id_idx
  ON venue_design_media (parent_id);

-- F2: refinements are their own quota, reserved before the model call.
ALTER TABLE vision_packs ADD COLUMN IF NOT EXISTS edits_quota integer NOT NULL DEFAULT 0;
ALTER TABLE vision_packs ADD COLUMN IF NOT EXISTS edits_used integer NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vision_packs_edits_quota_nonneg'
      AND conrelid = 'public.vision_packs'::regclass
  ) THEN
    ALTER TABLE vision_packs
      ADD CONSTRAINT vision_packs_edits_quota_nonneg CHECK (edits_quota >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vision_packs_edits_used_in_range'
      AND conrelid = 'public.vision_packs'::regclass
  ) THEN
    ALTER TABLE vision_packs
      ADD CONSTRAINT vision_packs_edits_used_in_range
      CHECK (edits_used >= 0 AND edits_used <= edits_quota);
  END IF;
END $$;

-- Backfill: paid packs get the registry's edit allowance; free tastes
-- still inside their 7-day window get their 3 changes and, if the single
-- render already flipped them to fulfilled, come back to active so the
-- couple can refine the render they already have.
UPDATE vision_packs SET edits_quota = 60
  WHERE sku IN ('wedding_design_pack_v1', 'wedding_vision_pack_v1')
    AND edits_quota = 0;
UPDATE vision_packs SET edits_quota = 3,
  status = CASE WHEN status = 'fulfilled' THEN 'active'::"VisionPackStatus" ELSE status END
  WHERE sku = 'wedding_free_taste_v1'
    AND edits_quota = 0
    AND status IN ('active', 'fulfilled')
    AND (expires_at IS NULL OR expires_at > now());

-- F6: family votes on a design's versions, through an unguessable link.
CREATE TABLE IF NOT EXISTS design_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id   uuid NOT NULL REFERENCES venue_designs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  token       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS design_shares_design_id_idx ON design_shares (design_id);
ALTER TABLE design_shares ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS design_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id    uuid NOT NULL REFERENCES design_shares(id) ON DELETE CASCADE ON UPDATE CASCADE,
  media_id    uuid NOT NULL REFERENCES venue_design_media(id) ON DELETE CASCADE ON UPDATE CASCADE,
  voter_key   text NOT NULL,
  voter_name  text NOT NULL,
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_votes_share_voter_key UNIQUE (share_id, voter_key)
);
CREATE INDEX IF NOT EXISTS design_votes_media_id_idx ON design_votes (media_id);
ALTER TABLE design_votes ENABLE ROW LEVEL SECURITY;
