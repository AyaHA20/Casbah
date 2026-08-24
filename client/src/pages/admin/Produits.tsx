import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  adminApi,
  describeError,
  uploadToSignedUrl,
  type AdminProduct,
  type AdminProductType,
  type AdminVariant,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDA } from '../../lib/format'
import { Ltr, useT } from '../../lib/i18n'
import {
  Chip,
  FIELD,
  FilterRow,
  FilterSummary,
  SortToggle,
  normalize,
} from '../../components/admin/filters'

function dateFmt(locale: string) {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** ISO instant -> "19/08/2026". Read the UTC parts: arrivalDate is a calendar
 *  day pinned at UTC midnight, so local formatting could shift it a day. */
function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return dateFmt(locale).format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** ISO instant -> "2026-08-19" for <input type="date">. */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

type SortKey = 'recent' | 'arrival' | 'name'
const SORTS: Array<{ key: SortKey; labelKey: 'products.sortRecent' | 'products.sortArrival' | 'products.sortName' }> = [
  { key: 'recent', labelKey: 'products.sortRecent' },
  { key: 'arrival', labelKey: 'products.sortArrival' },
  { key: 'name', labelKey: 'products.sortName' },
]

const LABEL = 'text-meta text-ink-soft'

type Etat = 'all' | 'active' | 'inactive'
const ETATS: Array<{ key: Etat; labelKey: 'products.all' | 'products.activeOnly' | 'products.inactiveOnly' }> = [
  { key: 'all', labelKey: 'products.all' },
  { key: 'active', labelKey: 'products.activeOnly' },
  { key: 'inactive', labelKey: 'products.inactiveOnly' },
]

export function AdminProduits() {
  const { t, lang, locale } = useT()
  const { token, signOut } = useAuth()
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storageOn, setStorageOn] = useState<boolean | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [types, setTypes] = useState<AdminProductType[]>([])
  const [total, setTotal] = useState(0)

  // Every filter below narrows the same set; none of them replaces another.
  const [etat, setEtat] = useState<Etat>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  // null = the Tri select owns the ordering; otherwise this takes over.
  const [stockDir, setStockDir] = useState<'asc' | 'desc' | null>(null)

  const guard = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') signOut()
      setError(describeError(e))
    },
    [signOut],
  )

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setError(null)
      const r = await adminApi.listProducts(token, { ...(q ? { q } : {}), sort, limit: 100 })
      setProducts(r.data)
      setTotal(r.pagination.total)
    } catch (e) {
      guard(e)
    }
  }, [token, q, sort, guard])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const refreshTypes = useCallback(async () => {
    if (!token) return
    try {
      setTypes(await adminApi.listProductTypes(token))
    } catch {
      // A missing type list must not block the whole page.
    }
  }, [token])

  useEffect(() => {
    void refreshTypes()
  }, [refreshTypes])

  useEffect(() => {
    if (!token) return
    adminApi
      .storageStatus(token)
      .then((s) => setStorageOn(s.configured))
      .catch(() => setStorageOn(false))
  }, [token])

  // Filtering and stock sorting happen here, not on the server: totalStock is a
  // computed sum of variants, not a column Prisma can order by.
  const rows = useMemo(() => {
    const needle = normalize(q)
    const min = minPrice ? Number(minPrice) : null
    const max = maxPrice ? Number(maxPrice) : null

    const out = products.filter((p) => {
      if (etat === 'active' && !p.active) return false
      if (etat === 'inactive' && p.active) return false

      // Redundant with the server while everything fits in one page, but it
      // keeps the box honest the moment this filters a fetched subset.
      if (needle) {
        const hay = normalize(p.name) + ' ' + normalize(p.supplier ?? '')
        if (!hay.includes(needle)) return false
      }

      if (min !== null && p.basePrice < min) return false
      if (max !== null && p.basePrice > max) return false

      if (from || to) {
        // A product with no arrival date cannot satisfy a date range, so it is
        // excluded rather than silently treated as matching.
        if (!p.arrivalDate) return false
        const day = p.arrivalDate.slice(0, 10)
        if (from && day < from) return false
        if (to && day > to) return false
      }
      return true
    })

    if (stockDir) {
      out.sort((a, b) =>
        stockDir === 'asc' ? a.totalStock - b.totalStock : b.totalStock - a.totalStock,
      )
    }
    return out
  }, [products, q, etat, minPrice, maxPrice, from, to, stockDir])

  const filtered = Boolean(
    q || etat !== 'all' || from || to || minPrice || maxPrice || stockDir !== null,
  )

  function reset() {
    setQ('')
    setEtat('all')
    setFrom('')
    setTo('')
    setMinPrice('')
    setMaxPrice('')
    setStockDir(null)
  }

  async function toggleActive(p: AdminProduct) {
    if (!token) return
    try {
      // Retirement is active = false — the normal way to take a product down.
      // Hard delete exists too, but only for never-sold products (see DeleteProduct).
      await adminApi.updateProduct(token, p.id, { active: !p.active })
      await refresh()
    } catch (e) {
      guard(e)
    }
  }

  return (
    <div className="col-span-full flex flex-col gap-6 px-gutter py-7 lg:px-10 lg:pb-14 lg:pt-9">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-[32px] lg:text-[42px]">{t('admin.products')}</h1>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="self-start rounded-pill border border-green bg-green px-5 py-3 text-sm font-semibold text-cream"
        >
          {creating ? t('products.cancel') : t('products.new')}
        </button>
      </div>

      {/* ---- Filters ---- */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('products.search')}
            className={`${FIELD} lg:w-[280px]`}
          />
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey)
              setStockDir(null) // one ordering at a time
            }}
            aria-label={t('products.sort')}
            className={`${FIELD} appearance-none`}
          >
            {SORTS.map((o) => (
              <option key={o.key} value={o.key}>
                {t('products.sort')} : {t(o.labelKey)}
              </option>
            ))}
          </select>
          <SortToggle
            label={t('stock.title')}
            direction={stockDir}
            onToggle={() => setStockDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          />
        </div>

        <FilterRow label={t('products.state')}>
          {ETATS.map((e) => (
            <Chip key={e.key} active={etat === e.key} onClick={() => setEtat(e.key)}>
              {t(e.labelKey)}
            </Chip>
          ))}
        </FilterRow>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterRow label={t('products.arrival')}>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label={t('products.arrival')}
              className={FIELD}
            />
            <span className="text-meta text-ink-soft">{t('products.and')}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label={t('products.arrival')}
              className={FIELD}
            />
          </FilterRow>

          <FilterRow label={t('products.priceRange')}>
            <input
              inputMode="numeric"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ''))}
              placeholder="min"
              aria-label={t('products.priceRange')}
              className={`${FIELD} w-[92px]`}
            />
            <span className="text-meta text-ink-soft">{t('products.to')}</span>
            <input
              inputMode="numeric"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ''))}
              placeholder="max"
              aria-label={t('products.priceRange')}
              className={`${FIELD} w-[92px]`}
            />
            <span className="text-meta text-ink-soft">DA</span>
          </FilterRow>
        </div>

        <FilterSummary
          count={rows.length}
          noun={[t('products.count'), t('products.countPlural')]}
          active={filtered}
          onReset={reset}
          loadedCeiling={{ loaded: products.length, total }}
        />
      </div>

      {storageOn === false && (
        <p className="rounded-md border border-line bg-field p-3 text-meta text-ink-soft">
          {t('products.storageOff')}
        </p>
      )}

      {error && (
        <p className="rounded-md border border-rust/40 bg-rust/5 p-4 text-body text-rust">{error}</p>
      )}

      {creating && (
        <ProductCreateForm
          types={types}
          onTypesChanged={refreshTypes}
          onDone={async () => {
            setCreating(false)
            await refresh()
          }}
          onError={guard}
        />
      )}

      <div className="flex flex-col">
        <div className="hidden grid-cols-[1.5fr_100px_1fr_100px_80px_90px] gap-4 border-b border-ink py-3 text-label font-semibold uppercase text-ink-soft lg:grid">
          <span>{t('stock.product')}</span>
          <span>{t('products.priceRange')}</span>
          <span>{t('products.supplier')}</span>
          <span>{t('products.arrivedOn')}</span>
          <span className="text-end">{t('stock.title')}</span>
          <span className="text-end">{t('products.state')}</span>
        </div>

        {rows.map((p) => (
          <div key={p.id} className="border-b border-line">
            <button
              type="button"
              onClick={() => setOpenId(openId === p.id ? null : p.id)}
              aria-expanded={openId === p.id}
              // Retired products stay visible but read as switched off, so the
              // list still shows the whole catalogue without implying it is live.
              className={`grid w-full grid-cols-2 items-center gap-3 py-4 text-start lg:grid-cols-[1.5fr_100px_1fr_100px_80px_90px] lg:gap-4 ${
                p.active ? '' : 'opacity-50 grayscale'
              }`}
            >
              <span className="col-span-2 lg:col-span-1">
                <span className="text-[15px] font-semibold">{p.name}</span>
                <span className="block text-xs text-ink-soft">
                  {p.slug} · {p.category?.name ?? t('products.noCategory')} · {p.type?.name ?? t('products.noTypeShort')} ·{' '}
                  {p.variants.length} décl.
                  {p.images.length > 0 && ` · ${p.images.length} photo(s)`}
                </span>
                <span className="block text-xs text-ink-soft lg:hidden">
                  {p.supplier ?? 'fournisseur —'} · arrivé {fmtDate(p.arrivalDate, locale)}
                </span>
              </span>
              <span className="font-display text-[17px] font-bold">{fmtDA(p.basePrice, lang)}</span>
              <span className="hidden truncate text-sm lg:inline" title={p.supplier ?? ''}>
                {p.supplier ?? <span className="text-line">—</span>}
              </span>
              <span className="hidden text-sm text-ink-soft lg:inline">
                {fmtDate(p.arrivalDate, locale)}
              </span>
              <span
                className={`text-end text-sm ${p.lowStock ? 'font-semibold text-rust' : ''}`}
              >
                {p.totalStock}
              </span>
              <span
                className={`text-end text-sm font-semibold ${p.active ? 'text-green' : 'text-ink-soft'}`}
              >
                {p.active ? t('products.active') : t('products.inactive')}
              </span>
            </button>

            {openId === p.id && (
              <ProductDetail
                product={p}
                types={types}
                onTypesChanged={refreshTypes}
                storageOn={storageOn === true}
                onToggleActive={() => void toggleActive(p)}
                onChanged={refresh}
                onDeleted={async () => {
                  setOpenId(null)
                  await refresh()
                }}
                onError={guard}
              />
            )}
          </div>
        ))}

        {rows.length === 0 && (
          <p className="py-10 text-center text-ink-soft">
            {products.length === 0 ? t('products.empty') : t('products.emptyFiltered')}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ProductCreateForm({
  types,
  onTypesChanged,
  onDone,
  onError,
}: {
  types: AdminProductType[]
  onTypesChanged: () => Promise<void>
  onDone: () => Promise<void>
  onError: (e: unknown) => void
}) {
  const { t } = useT()
  const { token } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [supplier, setSupplier] = useState('')
  const [arrival, setArrival] = useState('')
  const [typeId, setTypeId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setBusy(true)
    try {
      await adminApi.createProduct(token, {
        name: name.trim(),
        description: description.trim(),
        basePrice: Number(basePrice),
        supplier: supplier.trim() || null,
        arrivalDate: arrival || null,
        typeId,
      })
      setName('')
      setDescription('')
      setBasePrice('')
      setSupplier('')
      setArrival('')
      setTypeId(null)
      await onDone()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-green p-5 lg:p-6">
      <h2 className="text-h3">{t('products.new')}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('products.name')}</span>
          <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('products.basePrice')}</span>
          <input
            className={FIELD}
            inputMode="numeric"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>
      <TypePicker
        types={types}
        value={typeId}
        onChange={setTypeId}
        onTypesChanged={onTypesChanged}
        onError={onError}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('products.supplier')} {t('common.optional')}</span>
          <input className={FIELD} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('products.arrivedOn')} {t('common.optional')}</span>
          <input
            type="date"
            className={FIELD}
            value={arrival}
            onChange={(e) => setArrival(e.target.value)}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>{t('products.description')}</span>
        <textarea
          className={`${FIELD} min-h-[90px] resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={busy || !name || !description || !basePrice}
        className="self-start rounded-pill border border-green bg-green px-6 py-3 text-sm font-semibold text-cream disabled:border-line disabled:bg-line disabled:text-white"
      >
        {busy ? t('products.saving') : t('products.create')}
      </button>
      <p className="text-meta text-ink-soft">
        {t('products.slugHint')}
      </p>
    </form>
  )
}

// ---------------------------------------------------------------------------

function ProductDetail({
  product,
  types,
  onTypesChanged,
  storageOn,
  onToggleActive,
  onChanged,
  onDeleted,
  onError,
}: {
  product: AdminProduct
  types: AdminProductType[]
  onTypesChanged: () => Promise<void>
  storageOn: boolean
  onToggleActive: () => void
  onChanged: () => Promise<void>
  onDeleted: () => Promise<void>
  onError: (e: unknown) => void
}) {
  return (
    <div className="flex flex-col gap-6 border-t border-line bg-cream/40 p-gutter lg:p-6">
      <ActiveToggle product={product} onToggle={onToggleActive} />
      <ProductEditForm
        product={product}
        types={types}
        onTypesChanged={onTypesChanged}
        onChanged={onChanged}
        onError={onError}
      />
      <ImageManager product={product} enabled={storageOn} onChanged={onChanged} onError={onError} />
      <VariantEditor product={product} onChanged={onChanged} onError={onError} />
      <DeleteProduct product={product} onDeleted={onDeleted} onError={onError} />
    </div>
  )
}

// ---------------------------------------------------------------------------

function ActiveToggle({ product, onToggle }: { product: AdminProduct; onToggle: () => void }) {
  const { t } = useT()
  const on = product.active
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={`inline-flex items-center gap-2.5 rounded-pill border px-3 py-2 text-meta font-semibold ${
          on ? 'border-green bg-green text-cream' : 'border-line text-ink-soft'
        }`}
      >
        <span
          aria-hidden
          className={`grid h-5 w-9 items-center rounded-pill border ${
            on ? 'border-cream/60 bg-cream/25' : 'border-line bg-white'
          }`}
        >
          <span
            className={`h-3.5 w-3.5 rounded-pill transition-transform ${
              on
                ? 'translate-x-[19px] rtl:-translate-x-[19px] bg-cream'
                : 'translate-x-[3px] rtl:-translate-x-[3px] bg-line'
            }`}
          />
        </span>
        {on ? t('products.active') : t('products.inactive')}
      </button>
      <span className="text-meta text-ink-soft">
        {on
          ? t('products.visibleOn')
          : t('products.visibleOff')}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ProductEditForm({
  product,
  types,
  onTypesChanged,
  onChanged,
  onError,
}: {
  product: AdminProduct
  types: AdminProductType[]
  onTypesChanged: () => Promise<void>
  onChanged: () => Promise<void>
  onError: (e: unknown) => void
}) {
  const { t } = useT()
  const { token } = useAuth()
  const [name, setName] = useState(product.name)
  const [basePrice, setBasePrice] = useState(String(product.basePrice))
  const [description, setDescription] = useState(product.description)
  const [supplier, setSupplier] = useState(product.supplier ?? '')
  const [arrival, setArrival] = useState(toDateInput(product.arrivalDate))
  const [typeId, setTypeId] = useState<number | null>(product.type?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const price = Number(basePrice)
  const supplierChanged = supplier.trim() !== (product.supplier ?? '')
  const arrivalChanged = arrival !== toDateInput(product.arrivalDate)
  const typeChanged = typeId !== (product.type?.id ?? null)
  const dirty =
    name !== product.name ||
    price !== product.basePrice ||
    description !== product.description ||
    supplierChanged ||
    arrivalChanged ||
    typeChanged
  const valid = name.trim().length >= 2 && description.trim().length >= 5 && Number.isFinite(price)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !dirty) return
    setBusy(true)
    setSaved(false)
    try {
      // Send only what changed — PATCH writes exactly the keys it receives, so
      // an untouched field is never rewritten.
      await adminApi.updateProduct(token, product.id, {
        ...(name !== product.name ? { name: name.trim() } : {}),
        ...(price !== product.basePrice ? { basePrice: price } : {}),
        ...(description !== product.description ? { description: description.trim() } : {}),
        // Empty string clears the column rather than writing "".
        ...(supplierChanged ? { supplier: supplier.trim() || null } : {}),
        ...(arrivalChanged ? { arrivalDate: arrival || null } : {}),
        ...(typeChanged ? { typeId } : {}),
      })
      setSaved(true)
      await onChanged()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setName(product.name)
    setBasePrice(String(product.basePrice))
    setDescription(product.description)
    setSupplier(product.supplier ?? '')
    setArrival(toDateInput(product.arrivalDate))
    setTypeId(product.type?.id ?? null)
    setSaved(false)
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <span className="text-label font-semibold uppercase text-ink-soft">{t('products.sheet')}</span>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('products.name')}</span>
          <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('products.basePrice')}</span>
          <input
            className={FIELD}
            inputMode="numeric"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>

      <TypePicker
        types={types}
        value={typeId}
        onChange={setTypeId}
        onTypesChanged={onTypesChanged}
        onError={onError}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('products.supplier')}</span>
          <input
            className={FIELD}
            value={supplier}
            placeholder={t('ph.supplier')}
            onChange={(e) => setSupplier(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('products.arrivedOn')}</span>
          {/* Entered by hand, never auto-filled: this is the day the cartons
              landed, which is not the day the product was catalogued. */}
          <input
            type="date"
            className={FIELD}
            value={arrival}
            onChange={(e) => setArrival(e.target.value)}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>{t('products.description')}</span>
        <textarea
          className={`${FIELD} min-h-[100px] resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !dirty || !valid}
          className="rounded-pill border border-green bg-green px-6 py-2.5 text-meta font-semibold text-cream disabled:border-line disabled:bg-line disabled:text-white"
        >
          {busy ? t('products.saving') : t('products.save')}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={reset}
            className="text-meta text-ink-soft hover:text-rust"
          >
            {t('products.discard')}
          </button>
        )}
        {saved && !dirty && <span className="text-meta text-green">{t('products.saved')}</span>}
        <span className="text-meta text-ink-soft">
          Slug : <code>{product.slug}</code> {t('products.slugStable')}
        </span>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------

function ImageManager({
  product,
  enabled,
  onChanged,
  onError,
}: {
  product: AdminProduct
  enabled: boolean
  onChanged: () => Promise<void>
  onError: (e: unknown) => void
}) {
  const { t } = useT()
  const { token } = useAuth()
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    if (!token) return
    setBusy(true)
    try {
      // Three steps: ask the server for a signed URL, PUT the bytes straight to
      // Supabase, then tell the server which path to record.
      const signed = await adminApi.signUpload(token, product.id, file.name)
      await uploadToSignedUrl(signed.signedUrl, file)
      await adminApi.attachImage(token, product.id, signed.path)
      await onChanged()
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-label font-semibold uppercase text-ink-soft">{t('products.photos')}</span>
      <div className="flex flex-wrap gap-3">
        {product.images.map((url) => (
          <div key={url} className="flex flex-col gap-1">
            {/* Arch + glow: the design reserves both for product photography. */}
            <img
              src={url}
              alt=""
              className="h-[120px] w-[92px] rounded-arch border border-cream-edge bg-glow object-cover"
            />
            <button
              type="button"
              onClick={async () => {
                if (!token) return
                try {
                  await adminApi.detachImage(token, product.id, url)
                  await onChanged()
                } catch (e) {
                  onError(e)
                }
              }}
              className="text-xs text-ink-soft hover:text-rust"
            >
              {t('products.removePhoto')}
            </button>
          </div>
        ))}

        <label
          className={`grid h-[120px] w-[92px] place-items-center rounded-sm border border-dashed border-line text-center text-xs ${
            enabled ? 'cursor-pointer text-green' : 'cursor-not-allowed text-line'
          }`}
        >
          {busy ? t('products.uploading') : enabled ? t('products.addPhoto') : '—'}
          <input
            type="file"
            accept="image/*"
            disabled={!enabled || busy}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function VariantEditor({
  product,
  onChanged,
  onError,
}: {
  product: AdminProduct
  onChanged: () => Promise<void>
  onError: (e: unknown) => void
}) {
  const { t } = useT()
  const { token } = useAuth()
  const [draft, setDraft] = useState({ size: '', color: '', sku: '', stock: '0' })

  async function saveStock(v: AdminVariant, stock: number) {
    if (!token) return
    try {
      await adminApi.updateVariant(token, v.id, { stock })
      await onChanged()
    } catch (e) {
      onError(e)
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    try {
      await adminApi.createVariant(token, product.id, {
        size: draft.size.trim(),
        color: draft.color.trim(),
        sku: draft.sku.trim().toUpperCase(),
        stock: Number(draft.stock) || 0,
      })
      setDraft({ size: '', color: '', sku: '', stock: '0' })
      await onChanged()
    } catch (err) {
      onError(err)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-label font-semibold uppercase text-ink-soft">{t('products.variants')}</span>

      <div className="flex flex-col">
        {product.variants.map((v) => (
          <div
            key={v.id}
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-2.5 lg:grid-cols-[90px_1fr_140px_120px_90px]"
          >
            <span className="text-sm font-semibold">{v.size}</span>
            <span className="text-sm">{v.color}</span>
            <span className="hidden text-xs text-ink-soft lg:inline"><Ltr>{v.sku}</Ltr></span>
            <input
              type="number"
              min={0}
              defaultValue={v.stock}
              onBlur={(e) => {
                const next = Number(e.target.value)
                if (next !== v.stock) void saveStock(v, next)
              }}
              className={`w-[90px] rounded-sm border bg-field px-2 py-1.5 text-end text-sm outline-none focus:border-green ${
                v.stock === 0 ? 'border-rust text-rust' : 'border-line'
              }`}
            />
            <button
              type="button"
              onClick={async () => {
                if (!token) return
                try {
                  await adminApi.deleteVariant(token, v.id)
                  await onChanged()
                } catch (e) {
                  onError(e)
                }
              }}
              className="text-end text-xs text-ink-soft hover:text-rust"
            >
              Supprimer
            </button>
          </div>
        ))}
        {product.variants.length === 0 && (
          <p className="py-3 text-meta text-ink-soft">{t('products.noVariants')}</p>
        )}
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        {(['size', 'color', 'sku', 'stock'] as const).map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="text-xs text-ink-soft">
              {k === 'size'
                ? t('stock.size')
                : k === 'color'
                  ? t('stock.color')
                  : k === 'sku'
                    ? t('stock.sku')
                    : t('stock.title')}
            </span>
            <input
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              className="w-[110px] rounded-sm border border-line bg-field px-2 py-1.5 text-sm outline-none focus:border-green"
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={!draft.size || !draft.color || !draft.sku}
          className="rounded-pill border border-green px-4 py-2 text-meta font-semibold text-green disabled:border-line disabled:text-line"
        >
          {t('products.add')}
        </button>
      </form>
      <p className="text-meta text-ink-soft">
        {t('products.variantHint')}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * Hard delete, for products that never sold: added by mistake, supplier
 * cancelled, or the goods arrived and went straight back.
 *
 * The server refuses if any order line references the product; this is the only
 * place in the app that can delete one. Typing the exact name is the guard
 * against a mis-click, since there is no undo.
 */
function DeleteProduct({
  product,
  onDeleted,
  onError,
}: {
  product: AdminProduct
  onDeleted: () => Promise<void>
  onError: (e: unknown) => void
}) {
  const { t } = useT()
  const { token } = useAuth()
  const [arming, setArming] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  const matches = typed.trim() === product.name

  async function remove() {
    if (!token || !matches) return
    setBusy(true)
    try {
      await adminApi.deleteProduct(token, product.id)
      await onDeleted()
    } catch (e) {
      onError(e)
      setBusy(false)
    }
  }

  if (!arming) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button
          type="button"
          onClick={() => setArming(true)}
          className="rounded-pill border border-rust px-4 py-2 text-meta font-semibold text-rust"
        >
          {t('products.delete')}
        </button>
        <span className="text-meta text-ink-soft">
          {t('products.deleteHint')}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-5">
      <span className="text-meta font-semibold text-rust">
        Supprimer « {product.name} » — définitif
      </span>
      <span className="text-meta text-ink-soft">
        {product.variants.length} déclinaison{product.variants.length > 1 ? 's' : ''} et{' '}
        {product.images.length} photo{product.images.length > 1 ? 's' : ''} seront aussi supprimées.
        Tapez le nom exact pour confirmer.
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={product.name}
          aria-label={t('a11y.confirmName')}
          className={`${FIELD} lg:w-[320px]`}
        />
        <button
          type="button"
          disabled={!matches || busy}
          onClick={() => void remove()}
          className="rounded-pill border border-rust bg-rust px-5 py-2.5 text-meta font-semibold text-cream disabled:border-line disabled:bg-line disabled:text-white"
        >
          {busy ? t('products.deleting') : t('products.deleteForever')}
        </button>
        <button
          type="button"
          onClick={() => {
            setArming(false)
            setTyped('')
          }}
          className="text-meta text-ink-soft hover:text-ink"
        >
          {t('products.cancel')}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * Type selector that can mint a new type without leaving the form.
 *
 * Types are open-ended by nature -- a shop that starts selling abayas should not
 * have to wait for a deploy -- so creation lives right where the gap is noticed.
 */
function TypePicker({
  types,
  value,
  onChange,
  onTypesChanged,
  onError,
}: {
  types: AdminProductType[]
  value: number | null
  onChange: (id: number | null) => void
  onTypesChanged: () => Promise<void>
  onError: (e: unknown) => void
}) {
  const { t } = useT()
  const { token } = useAuth()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!token || name.trim().length < 2) return
    setBusy(true)
    try {
      const created = await adminApi.createProductType(token, name.trim())
      await onTypesChanged()
      onChange(created.id) // select what was just made
      setName('')
      setAdding(false)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL}>{t('products.type')}</span>
      {adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('ph.typeExample')}
            className={`${FIELD} flex-1`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void create()
              }
            }}
          />
          <button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={() => void create()}
            className="rounded-pill border border-green bg-green px-4 py-2 text-meta font-semibold text-cream disabled:border-line disabled:bg-line disabled:text-white"
          >
            {busy ? '…' : t('products.create')}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setName('')
            }}
            className="text-meta text-ink-soft hover:text-ink"
          >
            Annuler
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            className={`${FIELD} flex-1 appearance-none`}
          >
            <option value="">{t('products.noType')}</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="whitespace-nowrap rounded-pill border border-green px-3 py-2 text-meta font-semibold text-green"
          >
            {t('products.newType')}
          </button>
        </div>
      )}
    </div>
  )
}
