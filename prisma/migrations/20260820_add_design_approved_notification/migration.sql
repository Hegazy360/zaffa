-- Additive enum value for the design-approval admin alert (plan round 2, A2).
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction that also uses the
-- new value, so this file is applied standalone via `prisma db execute`
-- BEFORE any code that writes 'design_approved' deploys.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'design_approved';
