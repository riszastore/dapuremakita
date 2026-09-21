BEGIN;

ALTER TYPE "SubmissionStatus" RENAME TO "SubmissionStatus_legacy";
CREATE TYPE "SubmissionStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'REVISION_REQUIRED',
  'APPROVED',
  'READY_TO_PUBLISH',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
  'REJECTED'
);

ALTER TABLE "ProductSubmission" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ProductSubmission"
  ALTER COLUMN "status" TYPE "SubmissionStatus"
  USING CASE
    WHEN "status"::text = 'DRAFT' THEN 'DRAFT'::"SubmissionStatus"
    WHEN "status"::text = 'SUBMITTED' THEN 'SUBMITTED'::"SubmissionStatus"
    WHEN "status"::text = 'IN_REVIEW' THEN 'UNDER_REVIEW'::"SubmissionStatus"
    WHEN "status"::text = 'REVISION_REQUIRED' THEN 'REVISION_REQUIRED'::"SubmissionStatus"
    WHEN "status"::text = 'APPROVED' THEN 'APPROVED'::"SubmissionStatus"
    WHEN "status"::text = 'REJECTED' THEN 'REJECTED'::"SubmissionStatus"
    ELSE 'DRAFT'::"SubmissionStatus"
  END;
ALTER TABLE "ProductSubmission" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"SubmissionStatus";

ALTER TABLE "SubmissionRevision" ALTER COLUMN "fromStatus" DROP DEFAULT;
ALTER TABLE "SubmissionRevision"
  ALTER COLUMN "fromStatus" TYPE "SubmissionStatus"
  USING CASE
    WHEN "fromStatus"::text = 'DRAFT' THEN 'DRAFT'::"SubmissionStatus"
    WHEN "fromStatus"::text = 'SUBMITTED' THEN 'SUBMITTED'::"SubmissionStatus"
    WHEN "fromStatus"::text = 'IN_REVIEW' THEN 'UNDER_REVIEW'::"SubmissionStatus"
    WHEN "fromStatus"::text = 'REVISION_REQUIRED' THEN 'REVISION_REQUIRED'::"SubmissionStatus"
    WHEN "fromStatus"::text = 'APPROVED' THEN 'APPROVED'::"SubmissionStatus"
    WHEN "fromStatus"::text = 'REJECTED' THEN 'REJECTED'::"SubmissionStatus"
    ELSE 'DRAFT'::"SubmissionStatus"
  END;

ALTER TABLE "SubmissionRevision" ALTER COLUMN "toStatus" DROP DEFAULT;
ALTER TABLE "SubmissionRevision"
  ALTER COLUMN "toStatus" TYPE "SubmissionStatus"
  USING CASE
    WHEN "toStatus"::text = 'DRAFT' THEN 'DRAFT'::"SubmissionStatus"
    WHEN "toStatus"::text = 'SUBMITTED' THEN 'SUBMITTED'::"SubmissionStatus"
    WHEN "toStatus"::text = 'IN_REVIEW' THEN 'UNDER_REVIEW'::"SubmissionStatus"
    WHEN "toStatus"::text = 'REVISION_REQUIRED' THEN 'REVISION_REQUIRED'::"SubmissionStatus"
    WHEN "toStatus"::text = 'APPROVED' THEN 'APPROVED'::"SubmissionStatus"
    WHEN "toStatus"::text = 'REJECTED' THEN 'REJECTED'::"SubmissionStatus"
    ELSE 'DRAFT'::"SubmissionStatus"
  END;

DROP TYPE "SubmissionStatus_legacy";

ALTER TYPE "ProductStatus" RENAME TO "ProductStatus_legacy";
CREATE TYPE "ProductStatus" AS ENUM (
  'DRAFT',
  'REVIEW',
  'SUBMITTED',
  'UNDER_REVIEW',
  'REVISION_REQUIRED',
  'APPROVED',
  'READY_TO_PUBLISH',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
  'INACTIVE',
  'REJECTED'
);

ALTER TABLE "Product" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Product"
  ALTER COLUMN "status" TYPE "ProductStatus"
  USING CASE
    WHEN "status"::text = 'REVIEW' THEN 'UNDER_REVIEW'::"ProductStatus"
    WHEN "status"::text = 'DRAFT' THEN 'DRAFT'::"ProductStatus"
    WHEN "status"::text = 'ACTIVE' THEN 'ACTIVE'::"ProductStatus"
    WHEN "status"::text = 'INACTIVE' THEN 'INACTIVE'::"ProductStatus"
    ELSE 'DRAFT'::"ProductStatus"
  END;
ALTER TABLE "Product" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"ProductStatus";

DROP TYPE "ProductStatus_legacy";

CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "Partner" SET "updatedAt" = COALESCE("updatedAt", "createdAt") WHERE "updatedAt" IS NULL;
ALTER TABLE "Partner" ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE TABLE "SubmissionScore" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "curatorUserId" TEXT NOT NULL,
  "productFeasibility" INTEGER NOT NULL,
  "qualityConsistency" INTEGER NOT NULL,
  "legality" INTEGER NOT NULL,
  "productionCapacity" INTEGER NOT NULL,
  "pricingHpp" INTEGER NOT NULL,
  "packagingBranding" INTEGER NOT NULL,
  "marketReadiness" INTEGER NOT NULL,
  "subtotal" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "completionPercent" INTEGER NOT NULL,
  "decisionThreshold" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubmissionScore_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubmissionScore_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProductSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubmissionScore_curatorUserId_fkey" FOREIGN KEY ("curatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubmissionScore_submissionId_curatorUserId_key" ON "SubmissionScore"("submissionId", "curatorUserId");
CREATE INDEX "SubmissionScore_submissionId_createdAt_idx" ON "SubmissionScore"("submissionId", "createdAt");

CREATE TABLE "CuratorNote" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "reason" TEXT,
  "partnerVisible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CuratorNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CuratorNote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProductSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CuratorNote_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CuratorNote_submissionId_createdAt_idx" ON "CuratorNote"("submissionId", "createdAt");

CREATE TABLE "SubmissionDecision" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "fromStatus" "SubmissionStatus" NOT NULL,
  "toStatus" "SubmissionStatus" NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubmissionDecision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProductSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubmissionDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SubmissionDecision_submissionId_createdAt_idx" ON "SubmissionDecision"("submissionId", "createdAt");

CREATE TABLE "ProductFinalization" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "approvedByUserId" TEXT NOT NULL,
  "finalName" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "partnerInfo" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFinalization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductFinalization_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProductSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductFinalization_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductFinalization_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductFinalization_submissionId_key" ON "ProductFinalization"("submissionId");
CREATE UNIQUE INDEX "ProductFinalization_slug_key" ON "ProductFinalization"("slug");
CREATE INDEX "ProductFinalization_slug_idx" ON "ProductFinalization"("slug");

CREATE TABLE "ProductPublication" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "publishedByUserId" TEXT NOT NULL,
  "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductPublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductPublication_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProductSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductPublication_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductPublication_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductPublication_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductPublication_submissionId_key" ON "ProductPublication"("submissionId");
CREATE UNIQUE INDEX "ProductPublication_productId_key" ON "ProductPublication"("productId");
CREATE INDEX "ProductPublication_status_publishedAt_idx" ON "ProductPublication"("status", "publishedAt");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submissionId" TEXT,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AuditLog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProductSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

ALTER TABLE "ProductSubmission"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "ProductSubmission" SET "updatedAt" = COALESCE("updatedAt", "createdAt") WHERE "updatedAt" IS NULL;
ALTER TABLE "ProductSubmission" ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "ProductSubmission_status_updatedAt_idx" ON "ProductSubmission"("status", "updatedAt");

COMMIT;
