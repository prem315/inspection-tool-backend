-- CreateTable
CREATE TABLE "_RequestToCheckpoints" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RequestToCheckpoints_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RequestToCheckpoints_B_index" ON "_RequestToCheckpoints"("B");

-- AddForeignKey
ALTER TABLE "_RequestToCheckpoints" ADD CONSTRAINT "_RequestToCheckpoints_A_fkey" FOREIGN KEY ("A") REFERENCES "checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RequestToCheckpoints" ADD CONSTRAINT "_RequestToCheckpoints_B_fkey" FOREIGN KEY ("B") REFERENCES "inspection_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
