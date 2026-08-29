import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Commune, type CreatedOrder, type Wilaya } from '../lib/api'
import { fmtDA } from '../lib/format'
import { useCart } from '../lib/cart'
import { FetchError } from '../components/FetchError'
import { FieldSkeleton } from '../components/Skeleton'
import { Ltr, localized, useT } from '../lib/i18n'

const PHONE_RE = /^0[5-7]\d{8}$/

export function Commande() {
  const { t, lang } = useT()
  const { lines, subtotal, setQty, remove, clear } = useCart()

  const [wilayas, setWilayas] = useState<Wilaya[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [wilayaCode, setWilayaCode] = useState<number | null>(null)
  const [communeId, setCommuneId] = useState<number | null>(null)
  const [deliveryType, setDeliveryType] = useState<'DESK' | 'HOME'>('DESK')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  /** variantId -> units actually available, when the server says a line is short. */
  const [shortfall, setShortfall] = useState<Record<number, number>>({})
  const [error, setError] = useState<string | null>(null)
  /** Destination lookups are separate from submit errors: one blocks the form. */
  const [geoError, setGeoError] = useState<unknown>(null)
  const [geoLoading, setGeoLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [confirmed, setConfirmed] = useState<CreatedOrder | null>(null)

  useEffect(() => {
    setGeoLoading(true)
    setGeoError(null)
    api
      .listWilayas()
      .then((w) => {
        setWilayas(w)
        setWilayaCode((c) => c ?? w.find((x) => x.code === 16)?.code ?? w[0]?.code ?? null)
      })
      .catch((e: unknown) => setGeoError(e))
      .finally(() => setGeoLoading(false))
  }, [reloadKey])

  useEffect(() => {
    if (wilayaCode === null) return
    setCommunes([])
    setCommuneId(null)
    api
      .listCommunes(wilayaCode)
      .then((r) => {
        setCommunes(r.communes)
        setCommuneId(r.communes[0]?.id ?? null)
      })
      .catch((e: unknown) => setGeoError(e))
  }, [wilayaCode, reloadKey])

  const wilaya = useMemo(
    () => wilayas.find((w) => w.code === wilayaCode) ?? null,
    [wilayas, wilayaCode],
  )

  // Display only. The server recomputes all three from the database — if these
  // ever disagree, the server's numbers are the real ones.
  const shipping = (deliveryType === 'DESK' ? wilaya?.deskPrice : wilaya?.homePrice) ?? null
  const total = shipping === null ? null : subtotal + shipping

  const phoneOk = PHONE_RE.test(phone.replace(/\s/g, ''))
  const ready =
    lines.length > 0 &&
    customerName.trim().length >= 3 &&
    phoneOk &&
    wilayaCode !== null &&
    communeId !== null &&
    address.trim().length >= 5

  async function submit() {
    if (!ready || wilayaCode === null || communeId === null) return
    setSubmitting(true)
    setError(null)
    try {
      const order = await api.createOrder({
        customerName: customerName.trim(),
        phone: phone.replace(/\s/g, ''),
        wilayaCode,
        communeId,
        address: address.trim(),
        deliveryType,
        notes: notes.trim() || null,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      })
      setConfirmed(order)
      clear()
    } catch (e) {
      // OUT_OF_STOCK carries details: [{ sku, requested, available }]. Showing
      // only the message tells the customer something is wrong but not what to
      // change, which leaves them stuck on the page.
      if (e instanceof ApiError && e.code === 'OUT_OF_STOCK' && Array.isArray(e.details)) {
        const short: Record<number, number> = {}
        for (const d of e.details as Array<{ sku?: string; available?: number }>) {
          const line = lines.find((l) => l.sku === d.sku)
          if (line && typeof d.available === 'number') short[line.variantId] = d.available
        }
        setShortfall(short)
        setError(t('checkout.stockChanged') + ' ' + t('checkout.adjustCart'))
      } else {
        setError(e instanceof ApiError ? e.message : t('common.error'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Stock can run out while the cart sits in localStorage, so re-check on open
  // rather than letting the first signal be a failed submit.
  useEffect(() => {
    if (lines.length === 0) return
    let cancelled = false
    const slugs = [...new Set(lines.map((l) => l.slug))]
    Promise.all(slugs.map((s) => api.getProduct(s).catch(() => null)))
      .then((products) => {
        if (cancelled) return
        const stockByVariant = new Map<number, number>()
        for (const p of products) {
          if (!p) continue
          for (const v of p.variants) stockByVariant.set(v.id, v.stock)
        }
        const short: Record<number, number> = {}
        for (const l of lines) {
          const available = stockByVariant.get(l.variantId)
          if (available !== undefined && available < l.quantity) short[l.variantId] = available
        }
        setShortfall(short)
      })
      .catch(() => {
        /* a failed re-check must not block checkout — the server still guards it */
      })
    return () => {
      cancelled = true
    }
    // Runs on mount and whenever the cart contents change.
  }, [lines])

  const hasShortfall = Object.keys(shortfall).length > 0

  /* ---------------- Confirmation ---------------- */
  if (confirmed) {
    return (
      <div className="mx-auto max-w-shell px-gutter py-section lg:px-gutter-lg">
        <div className="mx-auto flex max-w-[560px] flex-col gap-5 rounded-lg border border-green p-8 text-center">
          <h1 className="text-h1">
            {t('checkout.successTitle')}
          </h1>
          <p className="font-display text-[40px] font-bold text-green">
            <Ltr>{confirmed.orderNumber}</Ltr>
          </p>
          <dl className="flex flex-col gap-2 border-t border-line pt-4 text-start text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">{t('checkout.subtotal')}</dt>
              <dd>{fmtDA(confirmed.subtotal, lang)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">{t('checkout.shipping')}</dt>
              <dd>{fmtDA(confirmed.shipping, lang)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-ink pt-3">
              <dt className="text-base font-semibold">{t('checkout.total')}</dt>
              <dd className="font-display text-[26px] font-bold text-green">
                {fmtDA(confirmed.total, lang)}
              </dd>
            </div>
          </dl>
          <p className="text-meta font-medium text-rust">
            {t('checkout.codShort')}
          </p>
          <p className="text-meta text-ink-soft">
            {t('checkout.weCall')}
          </p>
          <Link
            to="/"
            className="rounded-pill border border-green px-6 py-3 text-sm font-semibold text-green hover:bg-green hover:text-cream"
          >
            {t('product.back')}
          </Link>
        </div>
      </div>
    )
  }

  /* ---------------- Empty ---------------- */
  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-shell px-gutter py-section text-center lg:px-gutter-lg">
        <h1 className="text-h1">
          {t('cart.empty')}
        </h1>
        <Link
          to="/"
          className="mt-6 inline-block rounded-pill border border-green px-6 py-3 text-sm font-semibold text-green hover:bg-green hover:text-cream"
        >
          {t('cart.emptyCta')}
        </Link>
      </div>
    )
  }

  const fieldCls =
    'rounded-[12px] border border-line bg-field p-field text-body outline-none focus:border-green'
  const labelCls = 'text-meta text-ink-soft'

  const recap = (
    <div className="flex flex-col gap-[22px] rounded-lg border border-green p-[18px] lg:border-ink lg:p-8">
      <h2 className="hidden text-[30px] lg:block">{t('checkout.summary')}</h2>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between text-sm lg:text-[15px]">
          <span className="text-ink-soft">{t('checkout.subtotal')}</span>
          <span>{fmtDA(subtotal, lang)}</span>
        </div>
        <div className="flex justify-between text-sm lg:text-[15px]">
          <span className="text-ink-soft">
            {t('checkout.shipping')} —{' '}
            {wilaya ? localized(wilaya.nameFr, wilaya.nameAr, lang) : '…'}
          </span>
          <span>{shipping === null ? '…' : fmtDA(shipping, lang)}</span>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-[10px] lg:border-ink lg:pt-[14px]">
          <span className="text-[15px] font-semibold lg:text-base">{t('checkout.total')}</span>
          <span className="font-display text-[26px] font-bold text-green lg:text-[36px]">
            {total === null ? '…' : fmtDA(total, lang)}
          </span>
        </div>
      </div>
      <span className="text-xs font-medium leading-[1.5] text-rust lg:text-meta">
        {t('checkout.codNotice')}
      </span>

      {error && (
        <p className="rounded-md border border-rust/40 bg-rust/5 p-3 text-xs text-rust">{error}</p>
      )}

      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          onClick={submit}
          disabled={!ready || submitting || hasShortfall}
          className="flex-1 rounded-pill border border-green bg-green py-4 text-center text-[15px] font-semibold text-cream disabled:cursor-not-allowed disabled:border-line disabled:bg-line disabled:text-white lg:py-[18px] lg:text-base"
        >
          {submitting ? t('common.loading') : t('checkout.confirm')}
        </button>
        <span
          aria-hidden
          className="grid h-[52px] w-[52px] flex-none place-items-center rounded-pill border border-green text-xl text-green lg:h-14 lg:w-14"
        >
          <span className="inline-block rtl:-scale-x-100">↗</span>
        </span>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-shell px-gutter py-6 lg:grid lg:grid-cols-[1fr_480px] lg:items-start lg:gap-20 lg:px-gutter-lg lg:py-16">
      <div className="flex flex-col gap-6 lg:gap-8">
        <h1 className="text-[38px] leading-[0.94] lg:text-[64px] lg:leading-[0.92]">
          {t('checkout.contact')}
        </h1>

        {/* Panier */}
        <div className="flex flex-col border-t border-ink">
          {lines.map((l) => (
            <div
              key={l.variantId}
              className={`flex gap-3 border-b py-[14px] ${
                shortfall[l.variantId] !== undefined ? 'border-rust bg-rust/5' : 'border-line'
              }`}
            >
              <div className="h-[68px] w-14 flex-none rounded-[26px_26px_2px_2px] border border-cream-edge bg-glow" />
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  {localized(l.productName, l.productNameAr, lang)}
                </div>
                <div className="text-xs text-ink-soft">
                  {l.color} · {l.size}
                </div>
                {shortfall[l.variantId] !== undefined && (
                  <div className="mt-1 text-xs font-semibold text-rust">
                    {shortfall[l.variantId] === 0
                      ? t('checkout.nowSoldOut')
                      : `${t('checkout.onlyLeft')} ${shortfall[l.variantId]}`}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQty(l.variantId, l.quantity - 1)}
                    className="grid h-11 w-11 place-items-center rounded-sm border border-line text-lg text-green"
                  >
                    −
                  </button>
                  <span className="text-xs font-semibold">×{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQty(l.variantId, Math.min(99, l.quantity + 1))}
                    className="grid h-11 w-11 place-items-center rounded-sm border border-line text-lg text-green"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(l.variantId)}
                    className="ms-2 text-xs text-ink-soft hover:text-rust"
                  >
                    {t('cart.remove')}
                  </button>
                </div>
              </div>
              <span className="font-display text-base font-bold">
                {fmtDA(l.unitPrice * l.quantity, lang)}
              </span>
            </div>
          ))}
        </div>

        {/* Coordonnées */}
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>{t('checkout.name')}</span>
            <input
              className={fieldCls}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={t('ph.customerName')}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>{t('checkout.phone')}</span>
            <input
              className={fieldCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0561 88 12 04"
              inputMode="tel"
            />
            <span className={`text-xs ${phone && !phoneOk ? 'text-rust' : 'text-ink-soft'}`}>
              {phone && !phoneOk
                ? t('checkout.phoneFormat')
                : t('checkout.phoneHint')}
            </span>
          </label>
          {geoError !== null && (
            <div className="lg:col-span-2">
              <FetchError
                error={geoError}
                onRetry={() => setReloadKey((k) => k + 1)}
                compact
              />
            </div>
          )}

          {geoLoading && geoError === null && (
            <>
              <FieldSkeleton />
              <FieldSkeleton />
            </>
          )}

          <label className={`flex flex-col gap-1.5 ${geoLoading || geoError !== null ? 'hidden' : ''}`}>
            <span className={labelCls}>{t('checkout.wilaya')}</span>
            <select
              className={`${fieldCls} appearance-none`}
              value={wilayaCode ?? ''}
              onChange={(e) => setWilayaCode(Number(e.target.value))}
            >
              {wilayas.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.code} — {lang === 'ar' ? w.nameAr : w.nameFr}
                </option>
              ))}
            </select>
          </label>
          <label className={`flex flex-col gap-1.5 ${geoLoading || geoError !== null ? 'hidden' : ''}`}>
            <span className={labelCls}>{t('checkout.commune')}</span>
            <select
              className={`${fieldCls} appearance-none`}
              value={communeId ?? ''}
              onChange={(e) => setCommuneId(Number(e.target.value))}
              disabled={communes.length === 0}
            >
              {communes.map((c) => (
                <option key={c.id} value={c.id}>
                  {localized(c.name, c.nameAr, lang)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Livraison */}
        <div className="flex flex-col gap-3">
          <span className="text-label font-semibold uppercase text-ink-soft">{t('checkout.mode')}</span>
          <div className="flex gap-2 lg:max-w-[520px] lg:gap-3">
            {(
              [
                ['DESK', t('checkout.desk'), wilaya?.deskPrice ?? null],
                ['HOME', t('checkout.home'), wilaya?.homePrice ?? null],
              ] as const
            ).map(([mode, label, price]) => {
              const on = deliveryType === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDeliveryType(mode)}
                  className={`flex-1 rounded-md border p-[15px] text-start text-[14px] font-semibold lg:p-[18px] lg:text-base ${
                    on ? 'border-green bg-green text-cream' : 'border-line text-ink'
                  }`}
                >
                  {label}
                  <div className="pt-[3px] text-xs font-normal lg:text-meta">
                    {price === null ? '…' : fmtDA(price, lang)}
                  </div>
                </button>
              )
            })}
          </div>
          <span className="text-xs leading-[1.5] text-ink-soft lg:text-sm">
            {deliveryType === 'DESK'
              ? t('checkout.deskHint')
              : t('checkout.homeHint')}
          </span>
        </div>

        <label className="flex max-w-[640px] flex-col gap-1.5">
          <span className={labelCls}>{t('checkout.address')}</span>
          <textarea
            className={`${fieldCls} min-h-[76px] resize-y`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t('ph.address')}
          />
        </label>

        <label className="flex max-w-[640px] flex-col gap-1.5">
          <span className={labelCls}>{t('checkout.notes')}</span>
          <input
            className={fieldCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('ph.notes')}
          />
        </label>

        <p className="max-w-[56ch] border-t border-line pt-5 text-sm leading-[1.7] text-ink-soft">
          {t('checkout.longNote')}
        </p>
      </div>

      <div className="mt-8 lg:mt-0">{recap}</div>
    </div>
  )
}
