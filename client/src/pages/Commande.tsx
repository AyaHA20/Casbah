import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Commune, type CreatedOrder, type Wilaya } from '../lib/api'
import { fmtDA } from '../lib/format'
import { useCart } from '../lib/cart'

const PHONE_RE = /^0[5-7]\d{8}$/

export function Commande() {
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
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<CreatedOrder | null>(null)

  useEffect(() => {
    api
      .listWilayas()
      .then((w) => {
        setWilayas(w)
        setWilayaCode((c) => c ?? w.find((x) => x.code === 16)?.code ?? w[0]?.code ?? null)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

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
      .catch((e: Error) => setError(e.message))
  }, [wilayaCode])

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
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  /* ---------------- Confirmation ---------------- */
  if (confirmed) {
    return (
      <div className="mx-auto max-w-shell px-gutter py-section lg:px-gutter-lg">
        <div className="mx-auto flex max-w-[560px] flex-col gap-5 rounded-lg border border-green p-8 text-center">
          <h1 className="text-h1">
            Commande <span className="text-green">confirmée</span>
          </h1>
          <p className="font-display text-[40px] font-bold text-green">{confirmed.orderNumber}</p>
          <dl className="flex flex-col gap-2 border-t border-line pt-4 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Sous-total</dt>
              <dd>{fmtDA(confirmed.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Livraison</dt>
              <dd>{fmtDA(confirmed.shipping)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-ink pt-3">
              <dt className="text-base font-semibold">Total à payer</dt>
              <dd className="font-display text-[26px] font-bold text-green">
                {fmtDA(confirmed.total)}
              </dd>
            </div>
          </dl>
          <p className="text-meta font-medium text-rust">
            Vous payez en espèces à la réception. Aucun paiement en ligne.
          </p>
          <p className="text-meta text-ink-soft">
            Nous vous appelons pour confirmer avant l'expédition.
          </p>
          <Link
            to="/"
            className="rounded-pill border border-green px-6 py-3 text-sm font-semibold text-green hover:bg-green hover:text-cream"
          >
            Retour à la boutique
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
          Votre <span className="text-green">panier</span> est vide
        </h1>
        <Link
          to="/"
          className="mt-6 inline-block rounded-pill border border-green px-6 py-3 text-sm font-semibold text-green hover:bg-green hover:text-cream"
        >
          Voir la collection
        </Link>
      </div>
    )
  }

  const fieldCls =
    'rounded-[12px] border border-line bg-field p-field text-body outline-none focus:border-green'
  const labelCls = 'text-meta text-ink-soft'

  const recap = (
    <div className="flex flex-col gap-[22px] rounded-lg border border-green p-[18px] lg:border-ink lg:p-8">
      <h2 className="hidden text-[30px] lg:block">Récapitulatif</h2>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between text-sm lg:text-[15px]">
          <span className="text-ink-soft">Sous-total</span>
          <span>{fmtDA(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm lg:text-[15px]">
          <span className="text-ink-soft">Livraison — {wilaya?.nameFr ?? '…'}</span>
          <span>{shipping === null ? '…' : fmtDA(shipping)}</span>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-[10px] lg:border-ink lg:pt-[14px]">
          <span className="text-[15px] font-semibold lg:text-base">Total à payer</span>
          <span className="font-display text-[26px] font-bold text-green lg:text-[36px]">
            {total === null ? '…' : fmtDA(total)}
          </span>
        </div>
      </div>
      <span className="text-xs font-medium leading-[1.5] text-rust lg:text-meta">
        Vous payez en espèces à la réception. Aucun paiement en ligne, jamais.
      </span>

      {error && (
        <p className="rounded-md border border-rust/40 bg-rust/5 p-3 text-xs text-rust">{error}</p>
      )}

      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          onClick={submit}
          disabled={!ready || submitting}
          className="flex-1 rounded-pill border border-green bg-green py-4 text-center text-[15px] font-semibold text-cream disabled:cursor-not-allowed disabled:border-line disabled:bg-line disabled:text-white lg:py-[18px] lg:text-base"
        >
          {submitting ? 'Envoi…' : 'Confirmer la commande'}
        </button>
        <span
          aria-hidden
          className="grid h-[52px] w-[52px] flex-none place-items-center rounded-pill border border-green text-xl text-green lg:h-14 lg:w-14"
        >
          ↗
        </span>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-shell px-gutter py-6 lg:grid lg:grid-cols-[1fr_480px] lg:items-start lg:gap-20 lg:px-gutter-lg lg:py-16">
      <div className="flex flex-col gap-6 lg:gap-8">
        <h1 className="text-[38px] leading-[0.94] lg:text-[64px] lg:leading-[0.92]">
          Vos <span className="text-green">informations</span>
        </h1>

        {/* Panier */}
        <div className="flex flex-col border-t border-ink">
          {lines.map((l) => (
            <div key={l.variantId} className="flex gap-3 border-b border-line py-[14px]">
              <div className="h-[68px] w-14 flex-none rounded-[26px_26px_2px_2px] border border-cream-edge bg-glow" />
              <div className="flex-1">
                <div className="text-sm font-semibold">{l.productName}</div>
                <div className="text-xs text-ink-soft">
                  {l.color} · {l.size}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQty(l.variantId, l.quantity - 1)}
                    className="grid h-6 w-6 place-items-center rounded-sm border border-line text-green"
                  >
                    −
                  </button>
                  <span className="text-xs font-semibold">×{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQty(l.variantId, Math.min(99, l.quantity + 1))}
                    className="grid h-6 w-6 place-items-center rounded-sm border border-line text-green"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(l.variantId)}
                    className="ml-2 text-xs text-ink-soft hover:text-rust"
                  >
                    Retirer
                  </button>
                </div>
              </div>
              <span className="font-display text-base font-bold">
                {fmtDA(l.unitPrice * l.quantity)}
              </span>
            </div>
          ))}
        </div>

        {/* Coordonnées */}
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Nom et prénom</span>
            <input
              className={fieldCls}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Amine Belkacem"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Téléphone</span>
            <input
              className={fieldCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0561 88 12 04"
              inputMode="tel"
            />
            <span className={`text-xs ${phone && !phoneOk ? 'text-rust' : 'text-ink-soft'}`}>
              {phone && !phoneOk
                ? 'Format attendu : 0X XX XX XX XX (05, 06 ou 07).'
                : 'Le livreur vous appelle sur ce numéro.'}
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Wilaya</span>
            <select
              className={`${fieldCls} appearance-none`}
              value={wilayaCode ?? ''}
              onChange={(e) => setWilayaCode(Number(e.target.value))}
            >
              {wilayas.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.code} — {w.nameFr}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Commune</span>
            <select
              className={`${fieldCls} appearance-none`}
              value={communeId ?? ''}
              onChange={(e) => setCommuneId(Number(e.target.value))}
              disabled={communes.length === 0}
            >
              {communes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Livraison */}
        <div className="flex flex-col gap-3">
          <span className="text-label font-semibold uppercase text-ink-soft">Mode de livraison</span>
          <div className="flex gap-2 lg:max-w-[520px] lg:gap-3">
            {(
              [
                ['DESK', 'Stop desk', wilaya?.deskPrice ?? null],
                ['HOME', 'À domicile', wilaya?.homePrice ?? null],
              ] as const
            ).map(([mode, label, price]) => {
              const on = deliveryType === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDeliveryType(mode)}
                  className={`flex-1 rounded-md border p-[15px] text-left text-[14px] font-semibold lg:p-[18px] lg:text-base ${
                    on ? 'border-green bg-green text-cream' : 'border-line text-ink'
                  }`}
                >
                  {label}
                  <div className="pt-[3px] text-xs font-normal lg:text-meta">
                    {price === null ? '…' : fmtDA(price)}
                  </div>
                </button>
              )
            })}
          </div>
          <span className="text-xs leading-[1.5] text-ink-soft lg:text-sm">
            {deliveryType === 'DESK'
              ? 'Stop desk — vous retirez le colis au bureau du transporteur.'
              : 'À domicile — le livreur vous appelle avant de passer.'}
          </span>
        </div>

        <label className="flex max-w-[640px] flex-col gap-1.5">
          <span className={labelCls}>Adresse</span>
          <textarea
            className={`${fieldCls} min-h-[76px] resize-y`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="14 rue Didouche Mourad, 3e étage, en face de la pharmacie"
          />
        </label>

        <label className="flex max-w-[640px] flex-col gap-1.5">
          <span className={labelCls}>Note pour le livreur (facultatif)</span>
          <input
            className={fieldCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Appeler avant 18h"
          />
        </label>

        <p className="max-w-[56ch] border-t border-line pt-5 text-sm leading-[1.7] text-ink-soft">
          Nous vous appelons pour confirmer avant l'expédition. Aucun acompte, aucun frais caché :
          le montant affiché est celui que vous remettez au livreur. Retour ou échange sous 7 jours.
        </p>
      </div>

      <div className="mt-8 lg:mt-0">{recap}</div>
    </div>
  )
}
