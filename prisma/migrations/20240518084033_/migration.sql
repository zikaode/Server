/*
  Warnings:

  - You are about to drop the column `Status` on the `Whitelists` table. All the data in the column will be lost.
  - Added the required column `status` to the `Whitelists` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "StatusElection" ADD VALUE 'TERMINATE';

-- AlterTable
ALTER TABLE "Whitelists" DROP COLUMN "Status",
ADD COLUMN     "status" "StatusWhitelist" NOT NULL;

-- CreateTable
CREATE TABLE "_exception" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_saksi" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_exception_AB_unique" ON "_exception"("A", "B");

-- CreateIndex
CREATE INDEX "_exception_B_index" ON "_exception"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_saksi_AB_unique" ON "_saksi"("A", "B");

-- CreateIndex
CREATE INDEX "_saksi_B_index" ON "_saksi"("B");

-- AddForeignKey
ALTER TABLE "_exception" ADD CONSTRAINT "_exception_A_fkey" FOREIGN KEY ("A") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_exception" ADD CONSTRAINT "_exception_B_fkey" FOREIGN KEY ("B") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_saksi" ADD CONSTRAINT "_saksi_A_fkey" FOREIGN KEY ("A") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_saksi" ADD CONSTRAINT "_saksi_B_fkey" FOREIGN KEY ("B") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
