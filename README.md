
# Casbah

A cash-on-delivery storefront and admin dashboard for small clothing shops in Algeria, built around how these shops actually sell: no online payment, orders confirmed by phone, and a high return rate that the software has to treat as normal rather than exceptional.

The dashboard is the real product — it replaces the shop owner's WhatsApp thread and paper notebook.

---

## Live

| | |
|---|---|
| **Storefront** | *(add your Vercel URL)* |
| **Dashboard** | *(add your Vercel URL)*`/admin/login` |
| **Demo login** | `demo@casbah.dz` / `demo1234` |

The demo account is **read-only**: it can browse orders, products and stock, but every write is refused by the server. Enforcement lives in [`server/src/middleware/reject-read-only.ts`](server/src/middleware/reject-read-only.ts), not in the UI, so hiding a button is not what protects the data.

---

## Screenshots

<!-- Replace the placeholders with real images. -->

| Storefront | Product page |
|---|---|
| ![Storefront](docs/screenshots/storefront.png) | ![Product](docs/screenshots/product.png) |

| Orders | Order detail |
|---|---|
| ![Orders](docs/screenshots/admin-orders.png) | ![Order detail](docs/screenshots/admin-order.png) |

| Stock | Arabic (RTL) |
|---|---|
| ![Stock](docs/screenshots/admin-stock.png) | ![Arabic](docs/screenshots/rtl.png) |

---

## Stack

**Client** — React · Vite · TypeScript · Tailwind v4 (CSS-first `@theme`, no config file) · React Router
**Server** — Node · Express 5 · TypeScript · Zod · JWT · bcrypt
**Data** — PostgreSQL (Neon) · Prisma 7 with the `prisma-client` generator and the `@prisma/adapter-pg` driver adapter
**Storage** — Supabase Storage, uploaded to directly from the browser via signed URLs so the service-role key never leaves the server
**Deploy** — Vercel (client) · Railway (API)

French and Arabic throughout, with full RTL. Mobile-first: most traffic here is phones.

---

## Three decisions worth reading about

### 1. Prices are never taken from the client

The order payload carries no prices at all — no `unitPrice`, no `subtotal`, no `shipping`, no `total`. Zod strips unknown keys by default, so a request that helpfully includes `"total": 1` has it discarded before any code could read it, and the order service never touches `req.body` for money.

Every figure is looked up server-side: the unit price from `variant.priceOverride ?? product.basePrice`, the shipping cost from the wilaya's default `ShippingRate` row. A missing rate is a hard error rather than a fallback to zero — shipping free by accident is worse than refusing the order.

→ [`schemas/order.schema.ts`](server/src/schemas/order.schema.ts), [`services/orders.service.ts`](server/src/services/orders.service.ts)

### 2. The stock decrement *is* the stock check

The obvious version reads stock, compares, then decrements. Between those two steps another checkout can take the last unit and both orders succeed — you have sold stock you do not have.

Instead the `WHERE` clause carries the condition:

```ts
const res = await tx.variant.updateMany({
  where: { id: variantId, stock: { gte: quantity } },
  data:  { stock: { decrement: quantity } },
})
if (res.count === 0) throw outOfStock(variant)  // someone else got there first
```

One statement that only decrements when enough stock is present. `count === 0` means it lost the race, and the whole transaction rolls back. A friendly pre-check still runs first so the common case returns every short line at once; this is the backstop that makes it *correct* rather than merely usual.

Order creation and stock decrement share one `prisma.$transaction`, because an order whose stock was never decremented oversells, and a decrement without an order loses inventory for nothing.

Order numbers (`CMD-2026-0001`) are allocated in the same transaction under a Postgres advisory lock keyed on the year. Without it two concurrent checkouts both read `0007` and both write `0008`; the unique constraint catches that, but one customer eats an error at the last step of a flow that had otherwise worked.

### 3. `Order.stockRestored` — a latch, not a flag

Return rates are high here, so `CANCELLED` and `RETURNED` are a normal code path, not an edge case. Both put stock back on the shelf, and it must go back **exactly once**.

The guard is the same conditional-write shape as the decrement, with the condition moved from the stock column to the latch:

```ts
updateMany({ where: { id, status: current, stockRestored: false } })
```

One caller wins, restores the stock and sets the latch, inside the same transaction as the status change. The loser gets a 409. What this defends against is two admins clicking "Annuler" on the same order in the same second — *not* a cancel-then-return sequence, which the transition table makes unreachable: both states are terminal, and `CANCELLED → RETURNED` is rejected so that cancellations can never be relabelled as returns and corrupt the return-rate figure.

→ [`services/admin-orders.service.ts`](server/src/services/admin-orders.service.ts), [`lib/order-status.ts`](server/src/lib/order-status.ts)

---

## Local setup

Requires Node 20+ and a PostgreSQL database (Neon's free tier is fine).

```bash
git clone <this repo> && cd Casbah

# --- API ---
cd server
npm install
cp .env.example .env          # fill in DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD
npx prisma migrate deploy     # create the schema
npx prisma generate
npm run seed                  # 69 wilayas, 1541 communes, catalogue, admin user
npm run dev                   # http://localhost:4000

# --- Storefront (second terminal) ---
cd ../client
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm run dev                   # http://localhost:5173
```

Supabase credentials are optional for local work — everything runs without them except image upload.

### Demo data

```bash
cd server && npm run seed:demo
```

Creates ~20 orders spread across every status and the last three weeks, plus the read-only `demo@casbah.dz` account. It writes **only** orders and that user — the catalogue is never touched, so it is safe to re-run.

Re-running removes and rebuilds its own orders, identified by a fixed set of demo phone numbers, and aborts loudly if the deletion set ever matched an order outside that list.

To show the demo credentials in the storefront footer, set `VITE_DEMO_MODE=true` in `client/.env`. It is opt-in and matches only the exact string `true`, so a client deployment cannot leak a demo login by forgetting to unset it.

---

## Notes and limitations

**Shipping rates are representative sample data.** Every wilaya carries one generated `OTHER` rate derived from a regional band. These are **not** Yalidine, ZR Express or any other courier's real tariffs and must never be presented as such. Real prices load as `YALIDINE` / `ZR_EXPRESS` rows with `isDefault` moved onto whichever the shop actually uses — the table is designed so this needs no schema change.

**No online payment, by design.** Cash on delivery only. There is no Stripe, no PayPal and no card field anywhere in any flow, and there should never be one.

**No customer accounts.** COD buyers do not register; the phone number is the customer identity, which is why order history and the repeat-buyer and return-risk signals are all keyed on it. `User` is admin-only.

**Arabic is not native-reviewed.** UI strings are Modern Standard Arabic written during development and flagged as such in `dictionary.ar.ts`. Delivery vocabulary especially deserves a native pass before this goes in front of real customers. Product names and descriptions are hand-written, never machine-translated.

**No automated test suite yet.** Verification so far has been throwaway scripts run against a real database; there is no `npm test` that would catch a regression tomorrow.
 