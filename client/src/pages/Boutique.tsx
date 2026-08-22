import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type ProductListItem } from '../lib/api'
import { ProductCard } from '../components/ProductCard'

const RAYONS = [
  { slug: 'femme', label: 'Femme', wide: true, accent: false },
  { slug: 'homme', label: 'Homme', wide: false, accent: false },
  { slug: 'nouveautes', label: 'Nouveautés', wide: false, accent: true },
]

const ASSURANCES = [
  ['Paiement à', 'la livraison'],
  ['Livraison', '69 wilayas'],
  ['Retour sous', '7 jours'],
]

export function Boutique() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? ''
  const q = params.get('q') ?? ''

  const [products, setProducts] = useState<ProductListItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .listProducts({ ...(category ? { category } : {}), ...(q ? { q } : {}), limit: 12 })
      .then((r) => {
        if (!cancelled) setProducts(r.data)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [category, q])

  // Article counts for the Rayons tiles come from each category's own total.
  useEffect(() => {
    let cancelled = false
    Promise.all(
      RAYONS.map((r) => api.listProducts({ category: r.slug, limit: 1 }).then((x) => [r.slug, x.pagination.total] as const)),
    )
      .then((pairs) => {
        if (!cancelled) setCounts(Object.fromEntries(pairs))
      })
      .catch(() => {
        /* counts are decorative — a failure here must not blank the page */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="mx-auto max-w-shell px-gutter pb-8 pt-7 lg:grid lg:grid-cols-[1fr_620px] lg:items-center lg:gap-[72px] lg:px-gutter-lg lg:py-section">
        <div className="flex flex-col gap-[22px] lg:gap-[26px]">
          <span className="wordmark text-meta text-green lg:text-[15px] lg:tracking-[0.18em]">
            Style d'ici.
          </span>
          <h1 className="text-h1 lg:text-display">
            La <span className="text-green">collection</span> été est{' '}
            <span className="text-rust">arrivée</span>
          </h1>
          <p className="max-w-measure text-body lg:text-lead">
            Coupes larges, cotons épais, teintes de chaux et d'olive. Coupé et cousu à Alger, livré
            dans les 69 wilayas — vous payez à la réception du colis.
          </p>
          <div className="flex items-center gap-[10px]">
            <a
              href="#selection"
              className="rounded-pill border border-green px-[22px] py-[14px] text-sm font-semibold text-green hover:bg-green hover:text-cream"
            >
              Voir la collection
            </a>
            <a
              href="#selection"
              aria-hidden
              className="grid h-12 w-12 flex-none place-items-center rounded-pill bg-green text-xl text-cream"
            >
              ↗
            </a>
          </div>
        </div>

        {/* Arch — photos only */}
        <div className="mt-6 flex h-[420px] items-end justify-center rounded-arch border border-cream-edge bg-glow pb-[18px] lg:mt-0 lg:h-[560px] lg:rounded-arch-lg">
          <span className="text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            photo — look complet, fond clair
          </span>
        </div>
      </section>

      {/* ---------------- Assurances ---------------- */}
      <div className="flex border-y border-line bg-green text-cream">
        {ASSURANCES.map(([a, b], i) => (
          <div
            key={a}
            className={`flex-1 px-[10px] py-[14px] text-center text-[11px] font-medium leading-[1.4] tracking-[0.04em] lg:text-sm ${
              i > 0 ? 'border-l border-cream/35' : ''
            }`}
          >
            {a}
            <br />
            {b}
          </div>
        ))}
      </div>

      {/* ---------------- Rayons ---------------- */}
      <section className="mx-auto max-w-shell px-gutter py-7 lg:px-gutter-lg lg:py-section">
        <h2 className="text-h3 lg:text-h2">Rayons</h2>
        <div className="mt-[14px] grid grid-cols-2 gap-3 lg:mt-8 lg:grid-cols-3 lg:gap-6">
          {RAYONS.map((r) => (
            <Link
              key={r.slug}
              to={`/?category=${r.slug}`}
              className={`flex flex-col gap-1.5 rounded-lg border p-[18px] lg:p-8 ${
                r.wide ? 'col-span-2 lg:col-span-1' : ''
              } ${r.accent ? 'border-green bg-green text-cream' : 'border-line text-ink hover:border-green'}`}
            >
              <span className="font-display text-[22px] font-bold uppercase lg:text-[28px]">
                {r.label}
              </span>
              <span className={`text-xs ${r.accent ? 'text-cream/80' : 'text-ink-soft'}`}>
                {counts[r.slug] ?? '—'} articles ↗
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- Sélection ---------------- */}
      <section id="selection" className="mx-auto max-w-shell px-gutter pb-8 lg:px-gutter-lg lg:pb-section">
        <div className="flex items-baseline justify-between pb-[14px]">
          <h2 className="text-h3 lg:text-h2">
            {category ? RAYONS.find((r) => r.slug === category)?.label ?? 'Sélection' : 'Sélection'}
          </h2>
          {category || q ? (
            <button
              type="button"
              onClick={() => setParams({})}
              className="text-xs font-medium text-green hover:text-rust"
            >
              Tout voir ↗
            </button>
          ) : (
            <span className="text-xs font-medium text-ink-soft">Sélection de la semaine</span>
          )}
        </div>

        {loading && <p className="py-10 text-center text-ink-soft">Chargement…</p>}

        {error && (
          <p className="rounded-md border border-rust/40 bg-rust/5 p-4 text-body text-rust">
            {error}
          </p>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="py-10 text-center text-ink-soft">Aucun article dans ce rayon.</p>
        )}

        {/* Staggered grid: every second card drops 28px, as in the design. */}
        <div className="grid grid-cols-2 gap-x-[14px] gap-y-6 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-12">
          {products.map((p, i) => (
            <div key={p.id} className={i % 2 === 1 ? 'mt-7 lg:mt-0' : ''}>
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Atelier (zellige — ONE section per page) ---------------- */}
      <section className="relative overflow-hidden bg-green px-gutter py-[30px] text-cream lg:px-gutter-lg lg:py-section">
        <div className="absolute inset-0 bg-zellige opacity-motif" aria-hidden />
        <div className="relative mx-auto flex max-w-shell flex-col gap-3">
          <h3 className="font-kufi text-[25px] font-medium normal-case leading-[1.25] lg:text-[34px]">
            Atelier Bab Azoun, Alger
          </h3>
          <p className="max-w-measure text-sm leading-[1.6] text-cream/85 lg:text-body-lg">
            Nos pièces sont coupées et cousues à Alger, en séries courtes. Chaque commande est
            vérifiée à la main avant l'expédition.
          </p>
        </div>
      </section>
    </>
  )
}
