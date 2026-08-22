import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Product, type Variant } from '../lib/api'
import { bySize, fmtDA, swatch } from '../lib/format'
import { useCart } from '../lib/cart'

export function Produit() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const { add } = useCart()

  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [size, setSize] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setProduct(null)
    setError(null)
    api
      .getProduct(slug)
      .then((p) => {
        if (cancelled) return
        setProduct(p)
        const firstAvailable = p.variants.find((v) => v.available) ?? p.variants[0]
        setColor(firstAvailable?.color ?? null)
        setSize(firstAvailable?.size ?? null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const colors = useMemo(
    () => [...new Set(product?.variants.map((v) => v.color) ?? [])],
    [product],
  )

  const sizesForColor = useMemo(() => {
    if (!product || !color) return [] as Variant[]
    return product.variants.filter((v) => v.color === color).sort((a, b) => bySize(a.size, b.size))
  }, [product, color])

  const selected = useMemo(
    () => sizesForColor.find((v) => v.size === size) ?? null,
    [sizesForColor, size],
  )

  if (error) {
    return (
      <div className="mx-auto max-w-shell px-gutter py-section lg:px-gutter-lg">
        <h1 className="text-h1">Introuvable</h1>
        <p className="mt-4 text-body text-ink-soft">{error}</p>
        <Link to="/" className="mt-6 inline-block text-green hover:text-rust">
          ← Retour à la boutique
        </Link>
      </div>
    )
  }

  if (!product) {
    return <p className="px-gutter py-section text-center text-ink-soft">Chargement…</p>
  }

  const price = selected?.price ?? product.basePrice
  const canAdd = selected !== null && selected.stock >= qty

  function handleAdd() {
    if (!selected || !product) return
    add({
      variantId: selected.id,
      slug: product.slug,
      productName: product.name,
      size: selected.size,
      color: selected.color,
      sku: selected.sku,
      unitPrice: selected.price,
      quantity: qty,
    })
    setAdded(true)
  }

  return (
    <>
      {/* Breadcrumb — desktop only, as in the design */}
      <div className="hidden border-b border-line px-gutter-lg py-6 text-meta text-ink-soft lg:block">
        <div className="mx-auto max-w-shell">
          <Link to="/" className="hover:text-green">
            Accueil
          </Link>
          {' / '}
          <Link to={`/?category=${product.category.slug}`} className="hover:text-green">
            {product.category.name}
          </Link>
          {' / '}
          <span className="text-ink">{product.name}</span>
        </div>
      </div>

      <div className="mx-auto max-w-shell px-gutter py-5 lg:grid lg:grid-cols-[1fr_460px] lg:items-start lg:gap-10 lg:px-gutter-lg lg:py-14">
        {/* ---------- Photo ---------- */}
        <div>
          <div className="flex h-[400px] items-end justify-center rounded-arch border border-cream-edge bg-glow pb-4 lg:h-[720px] lg:rounded-arch-lg">
            <span className="text-[11px] uppercase tracking-[0.1em] text-ink-soft">
              photo 1 — face, fond clair
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 pt-[10px]">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-16 rounded-sm border bg-glow lg:h-[110px] ${
                  i === 0 ? 'border-green' : 'border-line'
                }`}
              />
            ))}
          </div>
        </div>

        {/* ---------- Details ---------- */}
        <div className="flex flex-col gap-5 py-6 lg:gap-[26px] lg:py-0">
          <div className="flex flex-col gap-2">
            <span className="wordmark text-[11px] text-green lg:text-meta">
              {product.category.name} · Réf. {selected?.sku ?? product.slug}
            </span>
            <h1 className="text-[38px] leading-[0.94] lg:text-[60px] lg:leading-[0.92]">
              {product.name}
            </h1>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-[30px] font-bold lg:text-[40px]">
                {fmtDA(price)}
              </span>
              <span className="text-meta text-ink-soft">TVA incluse · prix final</span>
            </div>
            {selected && selected.stock > 0 && (
              <span className="text-meta font-medium text-green">
                En stock — {selected.stock} pièce{selected.stock > 1 ? 's' : ''} disponible
                {selected.stock > 1 ? 's' : ''}
              </span>
            )}
            {selected && selected.stock === 0 && (
              <span className="text-meta font-medium text-rust">
                Épuisé dans cette taille et cette couleur.
              </span>
            )}
          </div>

          <p className="max-w-[46ch] text-body lg:text-body-lg">{product.description}</p>

          {/* Couleur */}
          <div className="flex flex-col gap-[10px]">
            <span className="text-label font-semibold uppercase text-ink-soft">
              Couleur — {color}
            </span>
            <div className="flex gap-[10px] lg:gap-3">
              {colors.map((c) => {
                const on = c === color
                return (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={c}
                    onClick={() => {
                      setColor(c)
                      setSize(null)
                      setAdded(false)
                    }}
                    style={{ background: swatch(c) }}
                    className={`h-[34px] w-[34px] rounded-pill lg:h-[38px] lg:w-[38px] ${
                      on
                        ? 'shadow-[0_0_0_2px_var(--color-cream),0_0_0_3px_var(--color-green)]'
                        : 'border border-line'
                    }`}
                  />
                )
              })}
            </div>
          </div>

          {/* Taille */}
          <div className="flex flex-col gap-[10px]">
            <div className="flex items-baseline justify-between">
              <span className="text-label font-semibold uppercase text-ink-soft">Taille</span>
              <span className="text-xs text-green">Guide des tailles ↗</span>
            </div>
            <div className="flex gap-2 lg:gap-[10px]">
              {sizesForColor.map((v) => {
                const on = v.size === size
                const out = v.stock === 0
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={out}
                    onClick={() => {
                      setSize(v.size)
                      setQty(1)
                      setAdded(false)
                    }}
                    className={`min-w-[52px] flex-1 rounded-sm border py-[13px] text-center text-[15px] font-semibold lg:min-w-[62px] lg:flex-none lg:px-5 ${
                      out
                        ? 'cursor-not-allowed border-line text-line line-through'
                        : on
                          ? 'border-green bg-green text-cream'
                          : 'border-line text-ink hover:border-green'
                    }`}
                  >
                    {v.size}
                  </button>
                )
              })}
            </div>
            {sizesForColor.some((v) => v.stock === 0) && (
              <span className="text-xs text-ink-soft">
                Les tailles barrées sont épuisées pour cette couleur.
              </span>
            )}
          </div>

          {/* Quantité */}
          <div className="flex items-center gap-4 lg:gap-[18px]">
            <span className="text-label font-semibold uppercase text-ink-soft">Quantité</span>
            <div className="flex items-center overflow-hidden rounded-[12px] border border-line">
              <button
                type="button"
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                className="grid h-11 w-11 place-items-center text-lg text-green"
              >
                −
              </button>
              <div className="w-11 text-center text-base font-semibold">{qty}</div>
              <button
                type="button"
                onClick={() => setQty((n) => Math.min(selected?.stock ?? 1, n + 1))}
                className="grid h-11 w-11 place-items-center text-lg text-green disabled:text-line"
                disabled={!selected || qty >= selected.stock}
              >
                +
              </button>
            </div>
          </div>

          {/* Ajouter */}
          <div className="flex items-center gap-[10px]">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd}
              className="flex-1 rounded-pill border border-green bg-green py-4 text-center text-[15px] font-semibold text-cream disabled:cursor-not-allowed disabled:border-line disabled:bg-line disabled:text-white lg:py-[18px] lg:text-base"
            >
              {canAdd ? 'Ajouter au panier' : 'Indisponible'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/commande')}
              aria-label="Aller à la commande"
              className="grid h-[52px] w-[52px] flex-none place-items-center rounded-pill border border-green text-xl text-green lg:h-14 lg:w-14"
            >
              ↗
            </button>
          </div>

          {added && (
            <p className="text-meta font-medium text-green">
              Ajouté au panier.{' '}
              <Link to="/commande" className="underline">
                Passer la commande ↗
              </Link>
            </p>
          )}

          {/* Info table */}
          <dl className="flex flex-col gap-[10px] border-t border-line pt-4 text-sm lg:gap-3 lg:pt-5 lg:text-[15px]">
            {[
              ['Paiement', 'À la livraison, en espèces'],
              ['Délai', '24 – 72 h après confirmation'],
              ['Retour', '7 jours, article non porté'],
              ['Une question ?', '0561 20 44 90'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-ink-soft">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </>
  )
}
