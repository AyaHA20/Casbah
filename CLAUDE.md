# Casbah — COD e-commerce (Algeria)

Storefront + admin dashboard for Algerian clothing shops. Portfolio project.
The admin dashboard is the real product — it replaces the shop owner's
WhatsApp thread and paper notebook.

## Stack

React + Vite + TypeScript + Tailwind **v4** · Express + TypeScript ·
PostgreSQL (Neon) + Prisma · Supabase Storage for images.

## Non-negotiable rules

**No online payment. Ever.** Cash on delivery only. Never add Stripe,
PayPal, or a card field anywhere in any flow. If a task seems to need
one, the task is wrong — ask me.

**Stock lives on `Variant`, never on `Product`.** A red M t-shirt and a
blue L t-shirt are separate rows with separate counts. Putting stock on
Product forces a painful migration later.

**Recalculate order totals server-side.** Never trust a price, subtotal,
or shipping cost sent from the client. Look prices up from the DB.

**Order creation + stock decrement must be one transaction.** A failure
must not leave stock wrong. Use `prisma.$transaction`.

**Restore stock on `CANCELLED` and `RETURNED`.** COD return rates here
are high; this is a real code path, not an edge case. Built, in
`server/src/services/admin-orders.service.ts`: the restore runs inside
the same transaction as the status change, guarded by the
`Order.stockRestored` latch.

That latch defends against **concurrent duplicate requests** — two admins
hitting "Annuler" on the same order in the same second — not against a
cancel-then-return sequence, which the transition table makes
unreachable. It is the same conditional-write shape as order creation,
with the guard moved from the stock column to the latch:
`updateMany({ where: { id, status: current, stockRestored: false } })`.
One caller wins, restores, and latches; the loser gets a 409.

**Never commit `.env`.** The `SUPABASE_SERVICE_ROLE_KEY` is server-side
only — never prefix a secret with `VITE_`, it ends up in the bundle.

## Domain notes

- `Product.gender` (FEMME/HOMME/UNISEXE, optional) is separate from Category.
  Category is merchandising — "Nouveautés" is not a gender. On the storefront
  UNISEXE is NOT a third bucket: `gender=FEMME` widens to
  `{ in: ['FEMME','UNISEXE'] }` so a unisex garment appears under both. The
  API rejects `gender=UNISEXE` as a filter value.
- **Category is seasonal/promotional only — never a gender.** Nouveautés,
  Soldes, Collection été. The Femme and Homme categories were folded into
  Nouveautés because having two fields answer "who is this for" let them
  contradict each other. Never re-add a gendered category. Storefront nav and
  the browse tiles filter on `?gender=`; the seasonal chips filter on
  `?category=`, and the two AND together. Admin CRUD is the Rayons panel on
  `/admin/produits`; deleting a section holding products is refused
  (`CATEGORY_IN_USE`) because `categoryId` is `SetNull` and would silently
  uncategorise them.
- 69 wilayas. Shipping price varies ShippingRate
  (stop desk vs à domicile). Stop desk is cheaper.
- Algerian phone format: `0[5-7]XXXXXXXX`. Validate it.
- Order status: `pending → confirmed → shipped → delivered`,
  plus `returned` and `cancelled`.
- `CANCELLED` and `RETURNED` are both terminal — nothing transitions out
  of either. `DELIVERED → RETURNED` is allowed (the normal COD return).
  `SHIPPED → CANCELLED` and `CANCELLED → RETURNED` are rejected: once a
  parcel is out, it coming back is a *retour*, and letting cancellations
  be relabelled as returns would corrupt the return-rate figure. The
  table lives in `server/src/lib/order-status.ts` and is enforced
  server-side and used to build the admin dropdown.
- Orders are confirmed by phone call before shipping. Fake orders are
  the main source of loss in this market.
- No customer accounts — COD buyers do not register. `User` is admin only.
- Prices in DZD, formatted with a thin space: `3 200 DA`.
- UI copy is in **French**.

## Design system

Tokens live in `client/src/index.css` as a Tailwind v4 `@theme` block.
Use the token classes, never raw hex.

- `green` #4B674F — primary: buttons, headings
- `cream` #F4F0DB — warm surfaces, text on green
- `rust`  #AB3730 — **accent only, max ~5% of any screen**
- `ink`   #2E2E2E — body text
- `line`  #D6D6D6 — borders, dividers
- Page background is white, not cream.

Fonts: `font-display` (Saira Condensed) for headings, `font-sans`
(Work Sans) for body, `.wordmark` (Reem Kufi) for the CASBAH logotype only.

**The arch is reserved for photos.** `rounded-arch` / `rounded-arch-md` /
`rounded-arch-lg` go on product images and nothing else. Pair with
`bg-glow`. Never put an arch on a card, button, or panel.

Zellige motif (`bg-zellige` + `opacity-motif`) on ONE section per page
maximum. It is texture, not decoration.

Mobile-first — most traffic is phones.

## Working with me

I'm learning as I build. When you write something non-obvious —
transactions, auth middleware, stock logic — add a one-line comment
saying *why*, not *what*.

Ask before installing a new dependency.

Work one phase at a time. Don't scaffold ahead.
prisma.product.delete() is allowed in EXACTLY one place: deleteProduct() in

server/src/services/admin-catalog.service.ts, behind the DELETE

/api/admin/products/:id endpoint. It refuses if any OrderItem references the

product. Never call it anywhere else — not in seed scripts, not in fixtures,

not in migrations. Retirement is still active = false; delete is only for

goods that never sold (added by mistake, supplier cancelled, stock rejected

and sent back).
run npx prisma generate after every schema change
I run migrations myself in PowerShell
Never run `taskkill /F /IM node.exe` — it kills my API and Vite dev
servers too. Kill specific PIDs only (netstat -ano finds the one you started).

Ports: **:4000** is my API and **:5173** my Vite dev server — never start,
stop or bind either. Use **:4010** for your own test servers
(`PORT=4010 npx tsx src/index.ts`) and kill only that PID. `client/.env`
points at :4000, so the storefront needs my API running.

## Not yet built

Honest list of what is missing, so nothing here reads as finished when
it isn't.

- **Nothing has been checked in a browser.** Every screen on both sides
  typechecks and builds, and every endpoint behind them is verified by
  API tests — but no page has been visually confirmed. Spacing, wrapping
  and the `@media print` output of `/admin/commandes/:id/imprimer` all
  need real eyes.
- **Storefront: Suivi de commande, Guide des tailles** — footer entries
  with no page, also inert text.
- **Shipping rates are placeholders.** Every wilaya has one `OTHER` rate
  generated from a regional band. They are NOT Yalidine or ZR Express
  prices and must never be shown as such. Real rates arrive as
  `YALIDINE` / `ZR_EXPRESS` rows with `isDefault` moved onto the one the
  shop actually uses.
- **Three Nouveautés products have no `gender`** — Sweat capuche Casbah,
  Sweat crewneck Tassili, Blouson bomber Kasbah Nuit. Until set they are
  invisible to both the Femme and Homme storefront filters.
- **Product/type/category Arabic is mostly empty.** The columns exist
  (`nameAr`, `descriptionAr`) and the storefront falls back to French,
  so an Arabic customer still reads French product names. Written by
  hand, never machine-translated.
- **No automated test suite.** Verification has been throwaway scripts
  run once and deleted. There is no `npm test` that would catch a
  regression tomorrow.

## Adding a field to a model

**A field is not "added" until every endpoint returning that model returns
it.** This has now gone wrong four times — per-colour photos, `gender`,
`nameAr` on `listFilters`, and the storefront render path — always the same
shape: the field is wired into the endpoint being worked on, its siblings are
forgotten, and the symptom shows up days later as "the admin saves it but the
storefront doesn't show it".

When adding or consuming a field on Product, Category, ProductType or Variant,
walk this list and check each one:

- **Product** — `listProducts`, `getProductBySlug`, `getStorefront`
  (featured strip), `productSelect` in `admin-catalog.service.ts`
- **Category / ProductType** — `listFilters`, plus the nested
  `category: { select }` / `type: { select }` inside all four Product selects
  above, plus `listCategories` / `listProductTypes`
- **Variant** — `getProductBySlug`, `productSelect`, `createVariant`,
  `updateVariant`, and the variant select in `orders.service.ts`
- **Wilaya** — `listWilayas` *and* the `wilaya` object inside `listCommunes`

Then two things that are not selects and are the ones actually missed:

1. **The client type must not lie.** If `api.ts` declares a field the select
   omits, TypeScript is silent and the value is `undefined` at runtime.
2. **A returned field still has to be rendered.** The Arabic bug was not a
   missing select — every endpoint had `nameAr`. `Produit.tsx` rendered
   `product.name` raw instead of calling `localized()`. Grep the render sites,
   not just the queries.

And a field is only real once something can *write* it: `ProductType.nameAr`
has existed for weeks with no admin control, so it is null on all 11 rows.

## Migration verification
`prisma migrate status` only compares the migrations folder to what's
recorded as applied. It does NOT detect a model in schema.prisma that
no migration ever created. On a P2021 "table does not exist", grep the
migration SQL for CREATE TABLE rather than trusting the status summary.
Reword it to: "Product Arabic complete (12/12). Category and
ProductType Arabic are writable via the admin panels but not yet
filled in."
