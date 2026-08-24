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

## Not yet built

Honest list of what is missing, so nothing here reads as finished when
it isn't.

- **Nothing has been checked in a browser.** Every screen on both sides
  typechecks and builds, and every endpoint behind them is verified by
  API tests — but no page has been visually confirmed. Spacing, wrapping
  and the `@media print` output of `/admin/commandes/:id/imprimer` all
  need real eyes.
- **Admin › Livraison** — the fourth nav item. No page; renders as inert
  text rather than a dead link. Would edit `ShippingRate` rows so a shop
  can load its courier's real price list.
- **Storefront: Suivi de commande, Guide des tailles** — footer entries
  with no page, also inert text.
- **Shipping rates are placeholders.** Every wilaya has one `OTHER` rate
  generated from a regional band. They are NOT Yalidine or ZR Express
  prices and must never be shown as such. Real rates arrive as
  `YALIDINE` / `ZR_EXPRESS` rows with `isDefault` moved onto the one the
  shop actually uses.
- **Seeded products have no photos.** Upload works end to end, but the 12
  seeded products still have `images: []`, so the storefront draws the
  arch-and-glow placeholder.
- **No automated test suite.** Verification has been throwaway scripts
  run once and deleted. There is no `npm test` that would catch a
  regression tomorrow.

## Migration verification
`prisma migrate status` only compares the migrations folder to what's
recorded as applied. It does NOT detect a model in schema.prisma that
no migration ever created. On a P2021 "table does not exist", grep the
migration SQL for CREATE TABLE rather than trusting the status summary.
