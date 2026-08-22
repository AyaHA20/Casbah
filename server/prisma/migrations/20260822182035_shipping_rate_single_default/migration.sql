-- Exactly one default shipping rate per wilaya.
--
-- Checkout reads the isDefault rate to price an order. Without this index two
-- rows for the same wilaya could both be isDefault, and checkout would silently
-- pick whichever the query returned first -- mispricing orders with no error.
-- Prisma's schema language cannot express a partial index, so it lives here.
CREATE UNIQUE INDEX "ShippingRate_one_default_per_wilaya"
  ON "ShippingRate" ("wilayaId")
  WHERE "isDefault";
