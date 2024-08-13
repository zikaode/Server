/*
  Warnings:

  - You are about to drop the `_exception` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[verificationToken]` on the table `Users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "_exception" DROP CONSTRAINT "_exception_A_fkey";

-- DropForeignKey
ALTER TABLE "_exception" DROP CONSTRAINT "_exception_B_fkey";

-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "isEmailValidate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTerminate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationToken" TEXT;

-- DropTable
DROP TABLE "_exception";

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saksiId" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exception_saksiId_key" ON "Exception"("saksiId");

-- CreateIndex
CREATE UNIQUE INDEX "Users_verificationToken_key" ON "Users"("verificationToken");

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_saksiId_fkey" FOREIGN KEY ("saksiId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
