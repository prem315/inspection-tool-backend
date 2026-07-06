-- CreateEnum
CREATE TYPE "CheckpointApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "InspectionRequestStatus" ADD VALUE 'DECLINED';

-- CreateTable
CREATE TABLE "checkpoint_approvals" (
    "id" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "status" "CheckpointApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "checkpoint_approvals_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "checkpoint_approvals" ADD CONSTRAINT "checkpoint_approvals_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "checkpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_approvals" ADD CONSTRAINT "checkpoint_approvals_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
