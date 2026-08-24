-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "typeId" INTEGER;

-- CreateTable
CREATE TABLE "ProductType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_slug_key" ON "ProductType"("slug");

-- CreateIndex
CREATE INDEX "Product_typeId_idx" ON "Product"("typeId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
