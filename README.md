# Casbah — a cash-on-delivery storefront for Algerian shops

**Live:** [casbah-vert.vercel.app](https://casbah-vert.vercel.app) · **Admin demo:** `/admin/login`
**Stack:** React · TypeScript · Tailwind · Express · Prisma · PostgreSQL · Supabase Storage

---

## The problem

Most small clothing shops in Algeria sell through Facebook and Instagram. Orders
arrive as DMs, get written in a notebook, and get shipped cash-on-delivery through
Yalidine or ZR Express. There is no stock system, no order history, and no way to
tell that the customer on the phone has already refused two parcels this month.

Off-the-shelf e-commerce templates don't fit. They assume card payment at checkout.
Here, nobody pays until the parcel is in their hands.

So I built the version that matches how these shops actually work — and put the
effort into the admin dashboard, because that's the part a shop owner is really
buying.

---

## What it does

**Storefront.** Browse by gender, product type and colour. Pick a size and colour,
add to cart, and check out with name, phone, wilaya and commune. No card fields
anywhere. Shipping cost updates live depending on the wilaya and whether the
customer collects from the courier's desk or wants home delivery. Full French and
Arabic, including right-to-left layout.

**Admin.** Every order on one screen, filtered by status, searchable by phone.
One-click status changes, click-to-call, a printable sheet to stick on the parcel,
product and stock management, and per-wilaya shipping rates the owner can edit
themselves.

---

## Three decisions

**Cash on delivery, not Stripe.** This is the whole premise. Adding an online
payment option would have been easier and completely useless to the people this is
for. Everything downstream follows from it: no customer accounts, phone number as
the primary identifier, and a confirmation call before anything ships.

**Stock lives on the variant, not the product.** A customer doesn't ask "do you
have this hoodie" — they ask "do you have it in M, in black". So stock is counted
per size and colour combination. Putting the count on the product would have been
simpler to build and wrong within a week.

**Order lines keep their own copy of what was sold.** When an order is placed, the
line item stores the product name, size, colour, SKU, price and photo as they were
at that moment. Shops rename products and change prices constantly. Without the
snapshot, a rename in March would silently rewrite what a January order says it
contained.

---

## The bug worth talking about

Two people work the phone in a shop. Both can be looking at the same order.

Cancelling an order puts its stock back on the shelf. If two staff click "Annuler"
on the same order in the same second, the naive implementation reads the order,
sees it hasn't been restored, and adds the stock back — twice. The shop now
believes it has inventory that doesn't exist, and finds out when a customer orders
something that isn't there.

The fix is to make the check and the write a single database statement, so there is
no gap between them:

```ts
const claimed = await tx.order.updateMany({
  where: { id, status: current, stockRestored: false },
  data:  { status: next, stockRestored: true },
})
if (claimed.count === 1) { /* restore stock */ }
```

Exactly one of the two requests matches. The other gets zero rows and restores
nothing.

Tested with two simultaneous cancel requests on a three-unit order: stock went from
9 to 12, not 9 to 15. One request returned 200, the other 409.

The same pattern guards the stock decrement at checkout — the `WHERE` clause *is*
the stock check, so two customers can't both buy the last item.

---

## Prices are never trusted from the browser

The client sends which variants and how many. It does not send prices. The server
looks up every price itself, calculates the subtotal, adds shipping from the wilaya
rate table, and writes its own total.

Tested by sending a deliberately faked payload with `unitPrice: 1` on every line.
The order was created at 14 700 DA. The database recorded the real prices.

---

## Notes

Shipping rates in the demo are representative sample data, not real courier
tariffs. They live in their own table with a carrier field, so a real deployment
loads the shop's actual price list without a schema change.

Arabic is machine-assisted and not professionally reviewed.
