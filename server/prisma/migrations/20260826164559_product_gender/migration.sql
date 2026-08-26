-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMME', 'HOMME', 'UNISEXE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gender" "Gender";
