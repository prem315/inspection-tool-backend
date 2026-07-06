-- DropIndex
DROP INDEX "organizations_slug_key";

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_active_key" ON "organizations"("slug") WHERE "deletedAt" IS NULL;
