CREATE TYPE "LegalDocumentType" AS ENUM ('BUSINESS_LICENSE', 'IDENTITY', 'FOOD_SAFETY', 'OTHER');
CREATE TYPE "LegalDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'REJECTED');
CREATE TYPE "SubmissionPhotoType" AS ENUM ('INITIAL');

ALTER TABLE "Partner" ADD COLUMN "userId" TEXT;
ALTER TABLE "Partner" ADD COLUMN "phone" TEXT;
ALTER TABLE "Partner" ADD COLUMN "address" TEXT;
CREATE UNIQUE INDEX "Partner_userId_key" ON "Partner"("userId");
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PartnerProfile" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "contactName" TEXT NOT NULL, "phone" TEXT NOT NULL, "address" TEXT NOT NULL, "city" TEXT NOT NULL, "province" TEXT NOT NULL, "postalCode" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id"), CONSTRAINT "PartnerProfile_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PartnerProfile_partnerId_key" ON "PartnerProfile"("partnerId");

CREATE TABLE "LegalDocument" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "type" "LegalDocumentType" NOT NULL, "status" "LegalDocumentStatus" NOT NULL DEFAULT 'PENDING', "originalName" TEXT NOT NULL, "objectKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id"), CONSTRAINT "LegalDocument_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LegalDocument_objectKey_key" ON "LegalDocument"("objectKey");
CREATE INDEX "LegalDocument_partnerId_createdAt_idx" ON "LegalDocument"("partnerId", "createdAt");

CREATE TABLE "ProductSubmission" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL, "categoryId" TEXT NOT NULL, "hppRupiah" INTEGER, "capacityAmount" INTEGER, "capacityUnit" TEXT, "capacityPeriod" TEXT, "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT', "submittedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductSubmission_pkey" PRIMARY KEY ("id"), CONSTRAINT "ProductSubmission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "ProductSubmission_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "ProductSubmission_hppRupiah_check" CHECK ("hppRupiah" IS NULL OR "hppRupiah" > 0), CONSTRAINT "ProductSubmission_capacityAmount_check" CHECK ("capacityAmount" IS NULL OR "capacityAmount" > 0)
);
CREATE INDEX "ProductSubmission_partnerId_status_updatedAt_idx" ON "ProductSubmission"("partnerId", "status", "updatedAt");

CREATE TABLE "SubmissionPhoto" (
  "id" TEXT NOT NULL, "submissionId" TEXT NOT NULL, "type" "SubmissionPhotoType" NOT NULL DEFAULT 'INITIAL', "originalName" TEXT NOT NULL, "objectKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionPhoto_pkey" PRIMARY KEY ("id"), CONSTRAINT "SubmissionPhoto_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProductSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubmissionPhoto_objectKey_key" ON "SubmissionPhoto"("objectKey");
CREATE INDEX "SubmissionPhoto_submissionId_createdAt_idx" ON "SubmissionPhoto"("submissionId", "createdAt");

CREATE TABLE "SubmissionRevision" (
  "id" TEXT NOT NULL, "submissionId" TEXT NOT NULL, "actorUserId" TEXT NOT NULL, "fromStatus" "SubmissionStatus" NOT NULL, "toStatus" "SubmissionStatus" NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionRevision_pkey" PRIMARY KEY ("id"), CONSTRAINT "SubmissionRevision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProductSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "SubmissionRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SubmissionRevision_submissionId_createdAt_idx" ON "SubmissionRevision"("submissionId", "createdAt");