import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ApiError,
  api,
  describeError,
  resolveGallery,
  type Commune,
  type CreatedOrder,
  type Wilaya,
} from '../lib/api'
import { fmtDA } from '../lib/format'
import { useCart } from '../lib/cart'
import { FetchError } from '../components/FetchError'
import { FieldSkeleton } from '../components/Skeleton'
import { Ltr, localized, useT } from '../lib/i18n'
import type { Dict } from '../lib/dictionary'

const PHONE_RE = /^0[5-7]\d{8}$/

type TKey = keyof Dict

/**
 * Where each rejected server field lives on this form.
 *
 * The API answers with `details: [{ path, message }]`; without this the page
 * could only show "Données invalides." and leave the customer hunting.
 */
const FIELD_FOR_PATH: Record<string, string> = {
  customerName: 'name',
  phone: 'phone',
  wilayaCode: 'wilaya',
  communeId: 'commune',
  address: 'address',
  notes: 'notes',
  items: 'cart',
}

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
  // variantId -> thumbnail. Resolved live from the catalogue rather than stored
  // on the cart line: a line can sit in localStorage for weeks, and the photo
  // it was added with may since have been replaced.
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
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

  /**
   * Every rule that blocks submission, named.
   *
   * This used to be one boolean, so a disabled button could not say which rule
   * failed — and with two failing at once (a short name AND a short address)
   * there was nothing on screen to fix. Address is deliberately absent: it is
   * optional now, because the driver phones the customer.
   */
  const problems: Array<{ field: 'name' | 'phone' | 'wilaya' | 'commune' | 'cart'; key: TKey }> = [
    ...(lines.length === 0
      ? [{ field: 'cart' as const, key: 'checkout.errCart' as const }]
      : []),
    ...(customerName.trim().length < 3
      ? [{ field: 'name' as const, key: 'checkout.errName' as const }]
      : []),
    ...(!phoneOk ? [{ field: 'phone' as const, key: 'checkout.errPhone' as const }] : []),
    // `> 0`, not `!== null`: the server requires a positive integer, and a 0
    // slipping through is exactly how the client came to disagree with it.
    ...(wilayaCode === null || wilayaCode <= 0
      ? [{ field: 'wilaya' as const, key: 'checkout.errWilaya' as const }]
      : []),
    ...(communeId === null || communeId <= 0
      ? [{ field: 'commune' as const, key: 'checkout.errCommune' as const }]
      : []),
  ]
  const ready = problems.length === 0

  // An inline message appears once the customer has left the field, or as soon
  // as they press a disabled Confirmer — never while they are still typing the
  // first three letters of their name.
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [attempted, setAttempted] = useState(false)
  // What the SERVER rejected, keyed by form field. Survives until the next
  // submit so the message stays put while the customer fixes the field.
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  // Editing a field retracts the server's verdict on it — a rejection left
  // sitting next to a value the customer has already corrected is its own bug.
  const clearServer = (field: string) =>
    setServerErrors((s) => (s[field] ? { ...s, [field]: '' } : s))

  const errorFor = (field: string): string | null => {
    // The server's verdict wins: it is the rule that actually blocked the
    // order, and if it disagrees with the client the client is the wrong one.
    if (serverErrors[field]) return serverErrors[field]
    if (!touched[field] && !attempted) return null
    const p = problems.find((x) => x.field === field)
    return p ? t(p.key) : null
  }

  async function submit() {
    if (!ready || wilayaCode === null || communeId === null) return
    setSubmitting(true)
    setError(null)
    // Last attempt's server verdict must not outlive this one.
    setServerErrors({})
    setShortfall({})
    try {
      const order = await api.createOrder({
        customerName: customerName.trim(),
        phone: phone.replace(/\s/g, ''),
        wilayaCode,
        communeId,
        // Empty box means "none given", not an empty address.
        address: address.trim() || null,
        deliveryType,
        notes: notes.trim() || null,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      })
      setConfirmed(order)
      clear()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'OUT_OF_STOCK') {
        // Two shapes reach here: the pre-check throws an ARRAY of every short
        // line, while the race-loser inside the transaction throws a single
        // OBJECT for the one variant it lost. Normalising means the rare race
        // marks its cart line too, instead of falling through to a banner.
        const raw = Array.isArray(e.details) ? e.details : [e.details]
        const short: Record<number, number> = {}
        for (const d of raw as Array<{ sku?: string; available?: number } | undefined>) {
          const line = d && lines.find((l) => l.sku === d.sku)
          // The race path knows only that it lost, not how many are left; 0 is
          // the honest reading and renders as "épuisé" on that line.
          if (line) short[line.variantId] = typeof d?.available === 'number' ? d.available : 0
        }
        setShortfall(short)
        setError(t('checkout.stockChanged') + ' ' + t('checkout.adjustCart'))
      } else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
        // The server names the failing field in details[].path. Discarding it
        // was the whole bug: "Données invalides." with nothing marked.
        const marked: Record<string, string> = {}
        const raw = Array.isArray(e.details) ? e.details : []
        for (const d of raw as Array<{ path?: string; message?: string }>) {
          const field = FIELD_FOR_PATH[String(d.path ?? '').split('.')[0] ?? '']
          if (field && d.message) marked[field] = d.message
        }
        setServerErrors(marked)
        setAttempted(true)
        // Unmapped paths would otherwise vanish, so the banner keeps the full
        // text via describeError() rather than the bare message.
        setError(Object.keys(marked).length > 0 ? t('checkout.fixFields') : describeError(e))
      } else {
        setError(describeError(e))
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
        const bySlug = new Map<string, (typeof products)[number]>()
        for (const p of products) {
          if (!p) continue
          bySlug.set(p.slug, p)
          for (const v of p.variants) stockByVariant.set(v.id, v.stock)
        }
        const short: Record<number, number> = {}
        // Same fetch, so the thumbnail costs no extra request.
        const pics: Record<number, string> = {}
        for (const l of lines) {
          const available = stockByVariant.get(l.variantId)
          if (available !== undefined && available < l.quantity) short[l.variantId] = available

          // The exact chain the product page uses — colour set, then the shared
          // set, then the legacy flat list. The cart line knows which colour was
          // chosen, so it gets the photo of that colour and not a generic one.
          const p = bySlug.get(l.slug)
          const first = p ? resolveGallery(p.galleries, p.images, l.color)[0] : undefined
          if (first) pics[l.variantId] = first
        }
        setShortfall(short)
        setThumbs(pics)
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
  const fieldErrCls =
    'rounded-[12px] border border-rust bg-field p-field text-body outline-none focus:border-rust'
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

      {/* The reason the button is dead, next to the button. Without this a
          customer with two invalid fields sees nothing at all and leaves. */}
      {!ready && (
        <p className="text-xs text-rust">
          {t('checkout.blocked')} {problems.map((p) => t(p.key)).join(' · ')}
        </p>
      )}

      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          onClick={() => {
            // Pressing a disabled button does nothing, so the wrapper catches
            // the intent and reveals every message at once.
            setAttempted(true)
            void submit()
          }}
          aria-disabled={!ready || submitting || hasShortfall}
          // Not `disabled`: a disabled button swallows the click, and the click
          // is what reveals the messages. It is styled dead and refuses in
          // submit() instead.
          disabled={submitting || hasShortfall}
          className={`flex-1 rounded-pill border py-4 text-center text-[15px] font-semibold lg:py-[18px] lg:text-base ${
            ready && !submitting && !hasShortfall
              ? 'border-green bg-green text-cream'
              : 'cursor-not-allowed border-line bg-line text-white'
          }`}
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
              {/* The arch belongs to photographs, and this slot is one. It
                  falls back to the empty arch while the catalogue loads, or if
                  the product genuinely has no photo. */}
              <div className="h-[68px] w-14 flex-none overflow-hidden rounded-[26px_26px_2px_2px] border border-cream-edge bg-glow">
                {thumbs[l.variantId] && (
                  <img
                    src={thumbs[l.variantId]}
                    alt={localized(l.productName, l.productNameAr, lang)}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
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
              className={errorFor('name') ? fieldErrCls : fieldCls}
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value)
                clearServer('name')
              }}
              onBlur={() => setTouched((s) => ({ ...s, name: true }))}
              aria-invalid={errorFor('name') !== null}
              placeholder={t('ph.customerName')}
            />
            {errorFor('name') && <span className="text-xs text-rust">{errorFor('name')}</span>}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>{t('checkout.phone')}</span>
            <input
              className={errorFor('phone') ? fieldErrCls : fieldCls}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                clearServer('phone')
              }}
              onBlur={() => setTouched((s) => ({ ...s, phone: true }))}
              aria-invalid={errorFor('phone') !== null}
              placeholder="0561 88 12 04"
              inputMode="tel"
            />
            <span className={`text-xs ${errorFor('phone') ? 'text-rust' : 'text-ink-soft'}`}>
              {errorFor('phone') ?? t('checkout.phoneHint')}
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
              className={`${errorFor('wilaya') ? fieldErrCls : fieldCls} appearance-none`}
              value={wilayaCode ?? ''}
              onChange={(e) => {
                setWilayaCode(e.target.value ? Number(e.target.value) : null)
                clearServer('wilaya')
              }}
              onBlur={() => setTouched((s) => ({ ...s, wilaya: true }))}
              aria-invalid={errorFor('wilaya') !== null}
            >
              {/* Without this the first wilaya looks selected while the state is
                  still null — the button then sits dead for no visible reason. */}
              <option value="">{t('checkout.chooseWilaya')}</option>
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
              className={`${errorFor('commune') ? fieldErrCls : fieldCls} appearance-none`}
              value={communeId ?? ''}
              onChange={(e) => {
                setCommuneId(e.target.value ? Number(e.target.value) : null)
                clearServer('commune')
              }}
              onBlur={() => setTouched((s) => ({ ...s, commune: true }))}
              aria-invalid={errorFor('commune') !== null}
              disabled={communes.length === 0}
            >
              <option value="">{t('checkout.chooseCommune')}</option>
              {communes.map((c) => (
                <option key={c.id} value={c.id}>
                  {localized(c.name, c.nameAr, lang)}
                </option>
              ))}
            </select>
            {errorFor('commune') && (
              <span className="text-xs text-rust">{errorFor('commune')}</span>
            )}
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
          <span className={labelCls}>
            {t('checkout.address')} {t('common.optional')}
          </span>
          {/* Not a nicety: an address is often not how a delivery happens here,
              and requiring one was turning real orders away. */}
          <span className="text-xs text-ink-soft">{t('checkout.addressHint')}</span>
          <textarea
            className={`${errorFor('address') ? fieldErrCls : fieldCls} min-h-[76px] resize-y`}
            aria-invalid={errorFor('address') !== null}
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
