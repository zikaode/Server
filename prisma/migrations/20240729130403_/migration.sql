/*
  Warnings:

  - You are about to drop the column `pubKey` on the `Profile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Election" ADD COLUMN     "publicKey" TEXT;

-- AlterTable
ALTER TABLE "Profile" DROP COLUMN "pubKey",
ADD COLUMN     "publicKey" TEXT;
