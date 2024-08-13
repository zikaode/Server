/*
  Warnings:

  - You are about to drop the column `username` on the `Profile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[nim]` on the table `Profile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nim` to the `Profile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pubKey` to the `Profile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Profile" DROP COLUMN "username",
ADD COLUMN     "nim" TEXT NOT NULL,
ADD COLUMN     "pubKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Profile_nim_key" ON "Profile"("nim");
