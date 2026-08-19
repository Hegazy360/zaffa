-- New enums for the full-service sales pipeline. Written by hand and made
-- idempotent because `prisma migrate diff` omitted the CreateEnum section
-- entirely for this delta; trusting it would have produced tables whose
-- column types did not exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EnquiryStatus') THEN
    CREATE TYPE "EnquiryStatus" AS ENUM (
      'new','contacted','call_scheduled','quote_sent','accepted',
      'deposit_paid','in_planning','delivered','lost'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EnquiryChannel') THEN
    CREATE TYPE "EnquiryChannel" AS ENUM ('whatsapp','email','phone');
  END IF;
END
$$;

-- `enquiry_received` powers the admin fan-out when a full-service enquiry
-- lands. ADD VALUE IF NOT EXISTS keeps this re-runnable.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'enquiry_received';

-- CreateTable
CREATE TABLE "enquiries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "EnquiryStatus" NOT NULL DEFAULT 'new',
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "preferred_channel" "EnquiryChannel" NOT NULL DEFAULT 'whatsapp',
    "country" VARCHAR(2),
    "city" TEXT,
    "event_date" DATE,
    "date_flexible" BOOLEAN NOT NULL DEFAULT false,
    "guest_band" TEXT,
    "budget_band" TEXT,
    "budget_currency" CHAR(3),
    "message" TEXT,
    "design_id" UUID,
    "event_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'whole_wedding_home',
    "locale" VARCHAR(5),
    "quoted_amount" DECIMAL(12,2),
    "quoted_currency" CHAR(3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enquiry_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiries_status_created_at_idx" ON "enquiries"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "enquiries_user_id_idx" ON "enquiries"("user_id");

-- CreateIndex
CREATE INDEX "enquiry_notes_enquiry_id_created_at_idx" ON "enquiry_notes"("enquiry_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "venue_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_notes" ADD CONSTRAINT "enquiry_notes_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_notes" ADD CONSTRAINT "enquiry_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
