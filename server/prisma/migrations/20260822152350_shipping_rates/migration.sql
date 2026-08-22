/*
  Warnings:

  - You are about to drop the column `deskPrice` on the `Wilaya` table. All the data in the column will be lost.
  - You are about to drop the column `homePrice` on the `Wilaya` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Carrier" AS ENUM ('YALIDINE', 'ZR_EXPRESS', 'OTHER');

-- AlterTable
ALTER TABLE "Wilaya" DROP COLUMN "deskPrice",
DROP COLUMN "homePrice";

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" SERIAL NOT NULL,
    "wilayaId" INTEGER NOT NULL,
    "carrier" "Carrier" NOT NULL,
    "deskPrice" INTEGER NOT NULL,
    "homePrice" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_wilayaId_carrier_key" ON "ShippingRate"("wilayaId", "carrier");

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_wilayaId_fkey" FOREIGN KEY ("wilayaId") REFERENCES "Wilaya"("id") ON DELETE CASCADE ON UPDATE CASCADE;
