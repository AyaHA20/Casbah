import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type ProductListItem, type Storefront, type StorefrontFilters } from '../lib/api'
import { ProductCard } from '../components/ProductCard'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { FetchError } from '../components/FetchError'
import { ProductGridSkeleton } from '../components/Skeleton'
import { swatch } from '../lib/format'
import { localized, useT } from '../lib/i18n'
import { renderHeroHeading } from '../lib/hero-markup'

/**
 * The browse tiles are keyed on gender now, not category — Category became
 * seasonal sections (Nouveautés, Soldes) and no longer says who anything is for.
 *
 * There is no UNISEXE tile for the same reason there is no UNISEXE chip: a
 * unisex garment belongs under BOTH Femme and Homme, and a third tile would
 * hide it from the two people looking for it. The third tile is the whole
 * catalogue instead, which is where a unisex product is always reachable.
 */
const RAYONS = [
  { gender: 'FEMME', labelKey: 'gender.FEMME', wide: true, accent: false },
  { gender: 'HOMME', labelKey: 'gender.HOMME', wide: false, accent: false },
  { gender: '', labelKey: 'home.tous', wide: false, accent: true },
] as const

const ASSURANCE_KEYS = ['home.assurance1', 'home.assurance2', 'home.assurance3'] as const

export function Boutique() {
  const { t, lang } = useT()
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState<StorefrontFilters | null>(null)
  const [store, setStore] = useState<Storefront | null>(null)
  const category = params.get('category') ?? ''
  // Combined, not either/or: every active filter narrows the same result set.
  const type = params.get('type') ?? ''
  const color = params.get('color') ?? ''
  // Only FEMME or HOMME reach the API. A UNISEXE product is returned under both,
  // so there is deliberately no third chip for it.
  const gender = params.get('gender') ?? ''
  const q = params.get('q') ?? ''

  const [products, setProducts] = useState<ProductListItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  // Bumping this re-runs every fetch effect — that is what Réessayer does.
  const [reloadKey, setReloadKey] = useState(0)
  // The filter bar failing is not decorative: without it there is no way to
  // filter, and silence looks like the feature does not exist.
  const [filtersFailed, setFiltersFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .listProducts({
        ...(category ? { category } : {}),
        ...(type ? { type } : {}),
        ...(color ? { color } : {}),
        ...(gender === 'FEMME' || gender === 'HOMME' ? { gender } : {}),
        ...(q ? { q } : {}),
        limit: 12,
      })
      .then((r) => {
        if (!cancelled) setProducts(r.data)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    
  return () => {
      cancelled = true
    }
  }, [category, type, color, gender, q, reloadKey])

  useEffect(() => {
    // Owner-controlled hero and featured list. A failure here must leave the
    // built-in defaults in place rather than blanking the page.
    api
      .getStorefront()
      .then(setStore)
      .catch(() => setStore(null))
  }, [reloadKey])

  useEffect(() => {
    setFiltersFailed(false)
    api
      .listFilters()
      .then((f) => {
        setFilters(f)
        setFiltersFailed(false)
      })
      .catch(() => {
        setFilters(null)
        setFiltersFailed(true)
      })
  }, [reloadKey])

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  // Tile counts. limit: 1 because only pagination.total is read — the tiles
  // never render the products themselves.
  useEffect(() => {
    let cancelled = false
    Promise.all(
      RAYONS.map((r) =>
        api
          .listProducts({ ...(r.gender ? { gender: r.gender } : {}), limit: 1 })
          .then((x) => [r.gender, x.pagination.total] as const),
      ),
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

  // Empty string means "not set" — the dictionary default takes over.
  const heroHeading = (lang === 'ar' ? store?.heroHeadingAr : store?.heroHeadingFr) ?? ''
  const heroBody = (lang === 'ar' ? store?.heroBodyAr : store?.heroBodyFr) ?? ''
  const heroCta = (lang === 'ar' ? store?.heroCtaAr : store?.heroCtaFr) ?? ''
  const heroImage = store?.heroImage ?? ''

  // The owner's featured list drives the unfiltered home grid. Any active
  // filter means the customer is searching, so the real results win — a
  // curated strip that ignores a colour filter would just look broken.
  // Gender belongs in here: without it, picking Femme from the nav still left
  // the curated home strip on screen and the filter looked broken.
  const filtering = Boolean(category || type || color || gender || q)
  const curated = store?.featured ?? []
  const activeCategory = filters?.categories.find((c) => c.slug === category)
  const heading =
    gender === 'FEMME' || gender === 'HOMME'
      ? t(`gender.${gender}`)
      : activeCategory
        ? localized(activeCategory.name, activeCategory.nameAr, lang)
        : t('home.selection')
  const shown = !filtering && curated.length > 0 ? curated : products

  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="mx-auto max-w-shell px-gutter pb-8 pt-7 lg:grid lg:grid-cols-[1fr_620px] lg:items-center lg:gap-[72px] lg:px-gutter-lg lg:py-section">
        <div className="flex flex-col gap-[22px] lg:gap-[26px]">
          <span className="wordmark text-meta text-green lg:text-[15px] lg:tracking-[0.18em]">
            {t('home.eyebrow')}
          </span>
          <h1 className="text-h1 lg:text-display">
            {heroHeading
              ? renderHeroHeading(heroHeading)
              : (
                  <>
                    {t('home.title1')} <span className="text-green">{t('home.title2')}</span>{' '}
                    {t('home.title3')} <span className="text-rust">{t('home.title4')}</span>
                  </>
                )}
          </h1>
          <p className="max-w-measure text-body lg:text-lead">
            {heroBody || t('home.lead')}
          </p>
          <div className="flex items-center gap-[10px]">
            <a
              href="#selection"
              className="rounded-pill border border-green px-[22px] py-[14px] text-sm font-semibold text-green hover:bg-green hover:text-cream"
            >
              {heroCta || t('home.cta')}
            </a>
            <a
              href="#selection"
              aria-hidden
              className="grid h-12 w-12 flex-none place-items-center rounded-pill bg-green text-xl text-cream"
            >
              <span className="inline-block rtl:-scale-x-100">↗</span>
            </a>
          </div>
        </div>

        {/* Arch — photos only */}
        <div className="mt-6 h-[420px] overflow-hidden rounded-arch border border-cream-edge bg-glow lg:mt-0 lg:h-[560px] lg:rounded-arch-lg">
          {heroImage ? (
            // The arch and its glow are reserved for photography — the owner's
            // seasonal image goes here, cropped to fill rather than letterboxed.
            <img src={heroImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-end justify-center pb-[18px]">
              <span className="text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                {t('home.heroPhoto')}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Assurances ---------------- */}
      <div className="flex border-y border-line bg-green text-cream">
        {ASSURANCE_KEYS.map((key, i) => (
          <div
            key={key}
            className={`flex-1 px-[10px] py-[14px] text-center text-[11px] font-medium leading-[1.4] tracking-[0.04em] lg:text-sm ${
              i > 0 ? 'border-s border-cream/35' : ''
            }`}
          >
            {t(key)}
          </div>
        ))}
      </div>

      {/* ---------------- Rayons ---------------- */}
      <section className="mx-auto max-w-shell px-gutter py-7 lg:px-gutter-lg lg:py-section">
        <h2 className="text-h3 lg:text-h2">{t('home.rayons')}</h2>
        <div className="mt-[14px] grid grid-cols-2 gap-3 lg:mt-8 lg:grid-cols-3 lg:gap-6">
          {RAYONS.map((r) => (
            <Link
              key={r.labelKey}
              to={r.gender ? `/?gender=${r.gender}` : '/'}
              className={`flex flex-col gap-1.5 rounded-lg border p-[18px] lg:p-8 ${
                r.wide ? 'col-span-2 lg:col-span-1' : ''
              } ${r.accent ? 'border-green bg-green text-cream' : 'border-line text-ink hover:border-green'}`}
            >
              <span className="font-display text-[22px] font-bold uppercase lg:text-[28px]">
                {t(r.labelKey)}
              </span>
              <span className={`text-xs ${r.accent ? 'text-cream/80' : 'text-ink-soft'}`}>
                {counts[r.gender] ?? '—'} {t('home.articles')} ↗
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- Sélection ---------------- */}
      <section id="selection" className="mx-auto max-w-shell px-gutter pb-8 lg:px-gutter-lg lg:pb-section">
        {/* The filter bar failing used to be silent: no bar, no explanation,
            looking like the feature does not exist. */}
        {filtersFailed && (
          <p className="mb-4 rounded-md border border-line bg-field p-3 text-meta text-ink-soft">
            {t('common.filtersUnavailable')}{' '}
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="font-semibold text-green underline"
            >
              {t('common.retry')}
            </button>
          </p>
        )}

        {/* Combined filters: type AND colour AND rayon all narrow together. */}
        {filters && (
          <div className="flex flex-col gap-3 pb-5">
            {/* Sections of the shop — seasonal and promotional, never gendered.
                Shown only when there are at least two: a lone chip filters
                nothing, since every product already sits in it. */}
            {filters.categories.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label font-semibold uppercase text-ink-soft">
                  {t('home.filterCategory')}
                </span>
                {filters.categories.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    aria-pressed={category === c.slug}
                    onClick={() => setFilter('category', category === c.slug ? '' : c.slug)}
                    className={`inline-flex min-h-11 items-center rounded-pill border px-4 text-meta font-semibold ${
                      category === c.slug ? 'border-green bg-green text-cream' : 'border-line text-ink'
                    }`}
                  >
                    {localized(c.name, c.nameAr, lang)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-label font-semibold uppercase text-ink-soft">
                {t('gender.label')}
              </span>
              {(['FEMME', 'HOMME'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={gender === g}
                  onClick={() => setFilter('gender', gender === g ? '' : g)}
                  className={`inline-flex min-h-11 items-center rounded-pill border px-4 text-meta font-semibold ${
                    gender === g ? 'border-green bg-green text-cream' : 'border-line text-ink'
                  }`}
                >
                  {t(`gender.${g}`)}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-label font-semibold uppercase text-ink-soft">{t('home.filterType')}</span>
              {/* Param renamed off `t`: it shadowed the translator, which is why
                  this chip could not reach localized() before. */}
              {filters.types.map((pt) => (
                <button
                  key={pt.slug}
                  type="button"
                  aria-pressed={type === pt.slug}
                  onClick={() => setFilter('type', type === pt.slug ? '' : pt.slug)}
                  className={`inline-flex min-h-11 items-center rounded-pill border px-4 text-meta font-semibold ${
                    type === pt.slug ? 'border-green bg-green text-cream' : 'border-line text-ink'
                  }`}
                >
                  {localized(pt.name, pt.nameAr, lang)}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-label font-semibold uppercase text-ink-soft">{t('home.filterColor')}</span>
              {filters.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={color === c}
                  onClick={() => setFilter('color', color === c ? '' : c)}
                  title={c}
                  className={`min-h-11 flex items-center gap-2 rounded-pill border px-3 py-1.5 text-meta ${
                    color === c ? 'border-green font-semibold text-green' : 'border-line text-ink-soft'
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 rounded-pill border border-line"
                    style={{ background: swatch(c) }}
                  />
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-baseline justify-between pb-[14px]">
          {/* Gender heads the title because it is what both the nav and the
              tiles set. Category is the fallback rather than a second half:
              the two are separate axes, and stacking them would read as a
              breadcrumb hierarchy that does not exist. */}
          <h2 className="text-h3 lg:text-h2">{heading}</h2>
          {filtering ? (
            <button
              type="button"
              onClick={() => setParams({})}
              className="text-xs font-medium text-green hover:text-rust"
            >
              {t('home.tousVoir')} ↗
            </button>
          ) : (
            <span className="text-xs font-medium text-ink-soft">{t('home.selection')}</span>
          )}
        </div>

        {loading && <ProductGridSkeleton count={8} />}

        {!loading && error !== null && (
          <FetchError error={error} onRetry={() => setReloadKey((k) => k + 1)} />
        )}

        {!loading && !error && shown.length === 0 && (
          <p className="py-10 text-center text-ink-soft">{t('home.empty')}</p>
        )}

        {/* Staggered grid: every second card drops 28px, as in the design. */}
        {!loading && error === null && (
        <div className="grid grid-cols-2 gap-x-[14px] gap-y-6 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-12">
          {shown.map((p, i) => (
            <div key={p.id} className={i % 2 === 1 ? 'mt-7 lg:mt-0' : ''}>
              {/* Per-card: a single malformed product loses its tile rather
                  than taking the grid — and the page — down with it. */}
              <ErrorBoundary label={`card:${p.slug}`} fallback={null}>
                <ProductCard product={p} />
              </ErrorBoundary>
            </div>
          ))}
        </div>
        )}
      </section>

      {/* ---------------- Atelier (zellige — ONE section per page) ---------------- */}
      <section className="relative overflow-hidden bg-green px-gutter py-[30px] text-cream lg:px-gutter-lg lg:py-section">
        <div className="absolute inset-0 bg-zellige opacity-motif" aria-hidden />
        <div className="relative mx-auto flex max-w-shell flex-col gap-3">
          <h3 className="font-kufi text-[25px] font-medium normal-case leading-[1.25] lg:text-[34px]">
            {t('home.atelierTitle')}
          </h3>
          <p className="max-w-measure text-sm leading-[1.6] text-cream/85 lg:text-body-lg">
            {t('home.atelierBody')}
          </p>
        </div>
      </section>
    </>
  )
}
