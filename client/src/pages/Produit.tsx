import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Product, type Variant, resolveGallery } from '../lib/api'
import { bySize, fmtDA, swatch } from '../lib/format'
import { useCart } from '../lib/cart'
import { FetchError } from '../components/FetchError'
import { ProductDetailSkeleton } from '../components/Skeleton'
import { localized, useT } from '../lib/i18n'

export function Produit() {
  const { t, lang } = useT()
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const { add } = useCart()

  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [color, setColor] = useState<string | null>(null)
  const [size, setSize] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [imgIndex, setImgIndex] = useState(0)

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
      .catch((e: unknown) => {
        if (!cancelled) setError(e)
      })
    return () => {
      cancelled = true
    }
  }, [slug, reloadKey])

  const colors = useMemo(
    () => [...new Set(product?.variants.map((v) => v.color) ?? [])],
    [product],
  )

  const sizesForColor = useMemo(() => {
    if (!product || !color) return [] as Variant[]
    return product.variants.filter((v) => v.color === color).sort((a, b) => bySize(a.size, b.size))
  }, [product, color])

  /**
   * Every size the product comes in, regardless of colour.
   *
   * Rendering only the sizes that exist in the current colour made the row
   * silently change length when switching colour — a size that is simply not
   * made in Gris looked identical to one that was never offered. Showing the
   * full set and disabling what is unavailable keeps the row stable and says
   * which is which.
   */
  const allSizes = useMemo(
    () => [...new Set(product?.variants.map((v) => v.size) ?? [])].sort(bySize),
    [product],
  )

  /** The variant for a size in the CURRENT colour, or null if not made. */
  const variantFor = useCallback(
    (s: string) => sizesForColor.find((v) => v.size === s) ?? null,
    [sizesForColor],
  )

  const selected = useMemo(
    () => (size === null ? null : variantFor(size)),
    [variantFor, size],
  )

  /**
   * Switching colour keeps the chosen size when that colour is made in it.
   *
   * The swatch used to clear the size outright, which left the page showing
   * "Indisponible" on a garment with stock — nothing was selected, but every
   * size still looked clickable.
   */
  function pickColor(next: string) {
    setColor(next)
    setAdded(false)
    setImgIndex(0)
    const inNext = (product?.variants ?? []).filter((v) => v.color === next)
    const keep = size !== null && inNext.some((v) => v.size === size && v.stock > 0)
    if (keep) return
    const firstInStock = inNext.filter((v) => v.stock > 0).sort((a, b) => bySize(a.size, b.size))[0]
    setSize(firstInStock?.size ?? null)
    setQty(1)
  }

  /**
   * Photos for the selected colour.
   *
   * Currently one set per product; when per-colour images land this is the only
   * place that changes.
   */
  const gallery = useMemo(
    () => resolveGallery(product?.galleries, product?.images ?? [], color),
    [product, color],
  )
  const heroImage = gallery[Math.min(imgIndex, Math.max(0, gallery.length - 1))]

  if (error !== null) {
    return (
      <div className="mx-auto max-w-shell px-gutter py-section lg:px-gutter-lg">
        <h1 className="text-h1">{t('product.notFound')}</h1>
        <div className="mt-5">
          <FetchError error={error} onRetry={() => setReloadKey((k) => k + 1)} />
        </div>
        <Link to="/" className="mt-6 inline-block min-h-11 text-green hover:text-rust">
          <span className="inline-block rtl:-scale-x-100">←</span> {t('product.back')}
        </Link>
      </div>
    )
  }

  if (!product) return <ProductDetailSkeleton />

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
            {t('product.breadcrumbHome')}
          </Link>
          {' / '}
          {product.category ? (
            <Link to={`/?category=${product.category.slug}`} className="hover:text-green">
              {localized(product.category.name, product.category.nameAr, lang)}
            </Link>
          ) : (
            <span>{t('products.noCategory')}</span>
          )}
          {' / '}
          <span className="text-ink">{product.name}</span>
        </div>
      </div>

      <div className="mx-auto max-w-shell px-gutter py-5 lg:grid lg:grid-cols-[1fr_460px] lg:items-start lg:gap-10 lg:px-gutter-lg lg:py-14">
        {/* ---------- Photo ---------- */}
        <div>
          {/* The arch is reserved for photos: top corners only, bottom at 3px. */}
          <div className="relative flex h-[400px] items-end justify-center overflow-hidden rounded-arch border border-cream-edge bg-glow pb-4 lg:h-[720px] lg:rounded-arch-lg">
            {heroImage ? (
              <img
                src={heroImage}
                alt={localized(product.name, product.nameAr, lang)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <span className="text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                {t('product.comingPhoto')}
              </span>
            )}
          </div>

          {gallery.length > 1 && (
            <div className="grid grid-cols-4 gap-2 pt-[10px]">
              {gallery.slice(0, 4).map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setImgIndex(i)}
                  aria-label={`${t('product.photoAlt')} ${i + 1}`}
                  aria-pressed={i === imgIndex}
                  className={`h-16 overflow-hidden rounded-sm border bg-glow lg:h-[110px] ${
                    i === imgIndex ? 'border-green' : 'border-line'
                  }`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------- Details ---------- */}
        <div className="flex flex-col gap-5 py-6 lg:gap-[26px] lg:py-0">
          <div className="flex flex-col gap-2">
            <span className="wordmark text-[11px] text-green lg:text-meta">
              {product.category
                ? localized(product.category.name, product.category.nameAr, lang)
                : t('products.noCategory')}
              {/* Always rendered when set: Category is now seasonal sections
                  only, so it can no longer duplicate the gender. Label only —
                  never a link, so it cannot become a browse bucket. */}
              {product.gender ? <> · {t(`gender.${product.gender}`)}</> : null}{' '}
              · {t('product.ref')} {selected?.sku ?? product.slug}
            </span>
            <h1 className="text-[38px] leading-[0.94] lg:text-[60px] lg:leading-[0.92]">
              {product.name}
            </h1>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-[30px] font-bold lg:text-[40px]">
                {fmtDA(price, lang)}
              </span>
              <span className="text-meta text-ink-soft">{t('product.vat')}</span>
            </div>
            {selected && selected.stock > 0 && (
              <span className="text-meta font-medium text-green">
                En stock — {selected.stock} pièce{selected.stock > 1 ? 's' : ''} disponible
                {selected.stock > 1 ? 's' : ''}
              </span>
            )}
            {selected && selected.stock === 0 && (
              <span className="text-meta font-medium text-rust">
                {t('product.soldOutCombo')}
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
                    onClick={() => pickColor(c)}
                    style={{ background: swatch(c) }}
                    className={`h-11 w-11 rounded-pill lg:h-[38px] lg:w-[38px] ${
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
              <span className="text-label font-semibold uppercase text-ink-soft">{t('product.size')}</span>
              <span className="text-xs text-green">{t('product.sizeGuide')} <span className="inline-block rtl:-scale-x-100">↗</span></span>
            </div>
            <div className="flex gap-2 lg:gap-[10px]">
              {allSizes.map((sz) => {
                const v = variantFor(sz)
                const on = v !== null && sz === size
                // Not made in this colour, or made and sold out — both are
                // unbuyable, and both must LOOK unbuyable rather than merely
                // refusing the click.
                const unavailable = v === null || v.stock === 0
                return (
                  <button
                    key={sz}
                    type="button"
                    disabled={unavailable}
                    aria-pressed={on}
                    title={v === null ? t('product.notInColor') : undefined}
                    onClick={() => {
                      setSize(sz)
                      setQty(1)
                      setAdded(false)
                    }}
                    className={`min-w-[52px] flex-1 rounded-sm border py-[13px] text-center text-[15px] font-semibold lg:min-w-[62px] lg:flex-none lg:px-5 ${
                      unavailable
                        ? 'cursor-not-allowed border-line text-line line-through'
                        : on
                          ? 'border-green bg-green text-cream'
                          : 'border-line text-ink hover:border-green'
                    }`}
                  >
                    {sz}
                  </button>
                )
              })}
            </div>
            {allSizes.some((sz) => { const v = variantFor(sz); return v === null || v.stock === 0 }) && (
              <span className="text-xs text-ink-soft">
                {t('product.struckHint')}
              </span>
            )}
          </div>

          {/* Quantité */}
          <div className="flex items-center gap-4 lg:gap-[18px]">
            <span className="text-label font-semibold uppercase text-ink-soft">{t('product.quantity')}</span>
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
              {canAdd ? t('product.addToCart') : t('product.cannotAdd')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/commande')}
              aria-label={t('cart.title')}
              className="grid h-[52px] w-[52px] flex-none place-items-center rounded-pill border border-green text-xl text-green lg:h-14 lg:w-14"
            >
              <span className="inline-block rtl:-scale-x-100">↗</span>
            </button>
          </div>

          {added && (
            <p className="text-meta font-medium text-green">
              {t('product.added')}{' '}
              <Link to="/commande" className="underline">
                {t('product.goToCheckout')} ↗
              </Link>
            </p>
          )}

          {/* Info table */}
          <dl className="flex flex-col gap-[10px] border-t border-line pt-4 text-sm lg:gap-3 lg:pt-5 lg:text-[15px]">
            {[
              ['Paiement', t('product.paymentValue')],
              ['Délai', t('product.delayValue')],
              ['Retour', t('product.returnValue')],
              [t('product.question'), '0561 20 44 90'],
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
