-- AlterTable
ALTER TABLE "Election" ALTER COLUMN "whitelistStart" DROP NOT NULL,
ALTER COLUMN "whitelistEnd" DROP NOT NULL,
ALTER COLUMN "voteStart" DROP NOT NULL,
ALTER COLUMN "voteEnd" DROP NOT NULL;
