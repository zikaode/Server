-- CreateEnum
CREATE TYPE "Access" AS ENUM ('ADMIN', 'USER', 'CANDIDATE', 'SAKSI');

-- CreateEnum
CREATE TYPE "StatusElection" AS ENUM ('DRAFT', 'ONGOING', 'FINISH');

-- CreateEnum
CREATE TYPE "StatusWhitelist" AS ENUM ('ACCEPT', 'DECLINE', 'PENDING');

-- CreateEnum
CREATE TYPE "Prodi" AS ENUM ('REKAYASA_MULTIMEDIA', 'TEKNOLOGI_KOMPUTER_JARINGAN', 'TEKNIK_INFORMATIKA', 'AKUTANSI', 'ADMINISTRASI_BISNIS', 'KEUANGAN_SEKTOR_PULIK', 'LEMBAGA_KEUANGAN_SYARIAH', 'LISTRIK', 'TELEKOMUNIKASI', 'ELEKTRONIKA', 'REKAYASA_PEMBANGKIT_LISTRIK', 'REKAYASA_JARINGAN_TELEKOMUNIKASI', 'REKAYASA_INSTRUMEN_DAN_KONTROL', 'TEKNOLOGI_INDUSTRI', 'TEKNOLOGI_MESIN', 'REKAYASA_MANUFAKTURING', 'REKAYASA_PENGELASAN_DAN_FABRIKASI', 'TEKNOLOGI_KIMIA', 'TEKNOLOGI_PENGOLAHAN_MINYAK_DAN_GAS', 'REKAYASA_KIMIA_INDUSTRI', 'KONSTRUKSI_BANGUNAN_AIR', 'KONSTRUKSI_JALAN_JEMBATAN', 'KONSTRUKSI_BANGUNAN_GEDUNG', 'REKAYASA_KONSTRUKSI_JALAN_JEMBATAN');

-- CreateEnum
CREATE TYPE "Jurusan" AS ENUM ('SIPIL', 'KIMIA', 'ELEKTRO', 'TATA_NIAGA', 'MESIN', 'TIK');

-- CreateTable
CREATE TABLE "Users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "access" "Access" NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "prodi" "Prodi" NOT NULL,
    "jurusan" "Jurusan" NOT NULL,
    "address" TEXT,
    "addressHistory" TEXT,
    "image" TEXT,
    "imageKTM" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whitelistStart" TIMESTAMP(3) NOT NULL,
    "whitelistEnd" TIMESTAMP(3) NOT NULL,
    "voteStart" TIMESTAMP(3) NOT NULL,
    "voteEnd" TIMESTAMP(3) NOT NULL,
    "organization" TEXT NOT NULL,
    "description" TEXT,
    "winner" TEXT,
    "Status" "StatusElection" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Whitelists" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "Status" "StatusWhitelist" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,

    CONSTRAINT "Whitelists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "ketuaId" TEXT NOT NULL,
    "wakilId" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "balloutCount" INTEGER NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "isvalid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "whitelistId" TEXT NOT NULL,

    CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Ballot_whitelistId_key" ON "Ballot"("whitelistId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Whitelists" ADD CONSTRAINT "Whitelists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Whitelists" ADD CONSTRAINT "Whitelists_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_ketuaId_fkey" FOREIGN KEY ("ketuaId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_wakilId_fkey" FOREIGN KEY ("wakilId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_whitelistId_fkey" FOREIGN KEY ("whitelistId") REFERENCES "Whitelists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
