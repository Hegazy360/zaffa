-- Tier consolidation (ZAF-77): the Design Pack absorbed the Vision Pack's
-- quotas (20 renders / 3 styles / 2 videos) when Vision retired from sale.
-- Quotas are stamped per-row at checkout, so the registry bump alone would
-- leave existing buyers at 10/1 while marketing says 20/2. Idempotent:
-- the WHERE clause makes a re-run a no-op.
UPDATE vision_packs
   SET renders_quota = 20,
       videos_quota  = 2
 WHERE sku = 'wedding_design_pack_v1'
   -- pending_payment included: a checkout session created before the
   -- deploy that completes after it must not activate with the old quotas.
   AND status IN ('active', 'fulfilled', 'pending_payment')
   AND (renders_quota < 20 OR videos_quota < 2);
