BEGIN;

ALTER TYPE "ProductStatus" RENAME TO "ProductStatus_legacy";
CREATE TYPE "ProductStatus" AS ENUM (
  'DRAFT',
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
    ELSE "status"::text::"ProductStatus"
  END;
ALTER TABLE "Product" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"ProductStatus";

ALTER TABLE "ProductPublication" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ProductPublication"
  ALTER COLUMN "status" TYPE "ProductStatus"
  USING CASE
    WHEN "status"::text = 'REVIEW' THEN 'UNDER_REVIEW'::"ProductStatus"
    ELSE "status"::text::"ProductStatus"
  END;
ALTER TABLE "ProductPublication" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"ProductStatus";

DROP TYPE "ProductStatus_legacy";

COMMIT;
