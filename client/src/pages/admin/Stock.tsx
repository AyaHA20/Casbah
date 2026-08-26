import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, adminApi, type LowStockRow, type StockPayload } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { FetchError } from '../../components/FetchError'
import { TableSkeleton } from '../../components/Skeleton'
import { bySize } from '../../lib/format'
import { Ltr, useT } from '../../lib/i18n'
import {
  Chip,
  FIELD,
  FilterRow,
  FilterSummary,
  SortToggle,
  normalize,
} from '../../components/admin/filters'

type Mode = 'low' | 'out' | 'all'

const MODES: Array<{ key: Mode; labelKey: 'stock.modeLow' | 'stock.modeOut' | 'stock.modeAll' }> = [
  { key: 'low', labelKey: 'stock.modeLow' },
  { key: 'out', labelKey: 'stock.modeOut' },
  { key: 'all', labelKey: 'stock.modeAll' },
]

export function AdminStock() {
  const { t, locale } = useT()
  const { token, signOut } = useAuth()
  const [payload, setPayload] = useState<StockPayload | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [listLoading, setListLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  // Opens on "what am I about to run out of", which is the question the page exists for.
  const [mode, setMode] = useState<Mode>('low')
  const [q, setQ] = useState('')
  const [sizes, setSizes] = useState<string[]>([])
  const [color, setColor] = useState('')
  // Ascending by default: worst first is the question this page answers.
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')

  const guard = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') signOut()
      setError(e)
    },
    [signOut],
  )

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setError(null)
      setListLoading(true)
      setPayload(await adminApi.lowStock(token))
    } catch (e) {
      guard(e)
    } finally {
      setListLoading(false)
    }
  }, [token, guard, reloadKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function save(row: LowStockRow, stock: number) {
    if (!token) return
    try {
      await adminApi.updateVariant(token, row.id, { stock })
      await refresh()
    } catch (e) {
      guard(e)
    }
  }

  // All filtering happens here, not on the server. The whole variant set is a
  // few KB, and a round trip to us-east-2 is ~170ms — far too slow to sit
  // behind every keystroke.
  const rows = useMemo(() => {
    const all = payload?.data ?? []
    const threshold = payload?.threshold ?? 5
    const needle = normalize(q)

    return all
      .filter((r) => {
        if (mode === 'out' && r.stock !== 0) return false
        if (mode === 'low' && r.stock > threshold) return false
        if (needle && !normalize(r.product.name).includes(needle)) return false
        if (sizes.length > 0 && !sizes.includes(r.size)) return false
        if (color && r.color !== color) return false
        return true
      })
      .sort((a, b) => {
        const byStock = dir === 'asc' ? a.stock - b.stock : b.stock - a.stock
        return byStock || a.product.name.localeCompare(b.product.name, locale)
      })
  }, [payload, mode, q, sizes, color, dir])

  const facetSizes = [...(payload?.facets.sizes ?? [])].sort(bySize)
  const outCount = rows.filter((r) => r.stock === 0).length
  const filtered = Boolean(q || sizes.length || color || mode !== 'all' || dir !== 'asc')

  function toggleSize(s: string) {
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  return (
    <div className="col-span-full flex flex-col gap-6 px-gutter py-7 lg:px-10 lg:pb-14 lg:pt-9">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-[32px] lg:text-[42px]">{t('stock.title')}</h1>
        <div className="flex gap-8">
          <Stat
            value={String(payload?.outOfStock ?? '—')}
            label={t('stock.outOfStock')}
            tone={(payload?.outOfStock ?? 0) > 0 ? 'rust' : 'ink'}
          />
          <Stat value={String(payload?.lowCount ?? '—')} label={`${t('stock.under')} ${payload?.threshold ?? 5}`} tone="ink" />
          <Stat value={String(payload?.data.length ?? '—')} label={t('stock.variants')} tone="ink" />
        </div>
      </div>

      {/* ---- Filters ---- */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map((m) => (
            <Chip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>
              {t(m.labelKey)}
            </Chip>
          ))}

          <SortToggle
            label={t('stock.title')}
            direction={dir}
            onToggle={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          />

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('stock.search')}
            className={`${FIELD} lg:w-[240px]`}
          />

          <select
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label={t('stock.color')}
            className={`${FIELD} appearance-none`}
          >
            <option value="">{t('stock.allColors')}</option>
            {(payload?.facets.colors ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <FilterRow label={t('stock.size')}>
          {facetSizes.map((s) => (
            <Chip key={s} active={sizes.includes(s)} onClick={() => toggleSize(s)}>
              {s}
            </Chip>
          ))}
        </FilterRow>

        <FilterSummary
          count={rows.length}
          noun={[t('stock.variants'), t('stock.variants')]}
          active={filtered}
          onReset={() => {
            setMode('all')
            setQ('')
            setSizes([])
            setColor('')
            setDir('asc')
          }}
          extra={
            outCount > 0 ? (
              <span className="font-semibold text-rust"> · {outCount} {t('stock.outOfStock')}</span>
            ) : null
          }
        />
      </div>

      {error !== null && (
        <FetchError error={error} onRetry={() => setReloadKey((k) => k + 1)} />
      )}

      {listLoading && error === null && <TableSkeleton rows={6} cols="lg:grid-cols-[1.8fr_80px_1fr_150px_100px]" />}

      {/* ---- Table ---- */}
      <div className="flex flex-col">
        <div className="hidden grid-cols-[1.8fr_80px_1fr_150px_100px] gap-5 border-b border-ink py-3 text-label font-semibold uppercase text-ink-soft lg:grid">
          <span>{t('stock.product')}</span>
          <span>{t('stock.size')}</span>
          <span>{t('stock.color')}</span>
          <span>{t('stock.sku')}</span>
          <span className="text-end">{t('stock.title')}</span>
        </div>

        {rows.map((r) => (
          <div
            key={r.id}
            className={`grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-3 lg:grid-cols-[1.8fr_80px_1fr_150px_100px] lg:gap-5 ${
              r.product.active ? '' : 'opacity-60'
            }`}
          >
            <span className="col-span-2 lg:col-span-1">
              <Link to="/admin/produits" className="text-sm font-semibold hover:text-green">
                {r.product.name}
              </Link>
              {!r.product.active && <span className="ms-2 text-xs text-ink-soft">{t('stock.retired')}</span>}
              <span className="block text-xs text-ink-soft lg:hidden">
                {r.size} · {r.color} · <Ltr>{r.sku}</Ltr>
              </span>
            </span>
            <span className="hidden text-sm font-semibold lg:inline">{r.size}</span>
            <span className="hidden text-sm lg:inline">{r.color}</span>
            <span className="hidden text-xs text-ink-soft lg:inline"><Ltr>{r.sku}</Ltr></span>
            <input
              type="number"
              min={0}
              defaultValue={r.stock}
              key={`${r.id}-${r.stock}`}
              onBlur={(e) => {
                const next = Number(e.target.value)
                if (next !== r.stock) void save(r, next)
              }}
              className={`w-[90px] justify-self-end rounded-sm border bg-field min-h-11 px-2 text-end text-sm outline-none focus:border-green ${
                r.stock === 0 ? 'border-rust font-semibold text-rust' : 'border-line'
              }`}
            />
          </div>
        ))}

        {rows.length === 0 && (
          <p className="py-10 text-center text-ink-soft">
            {payload ? t('stock.empty') : t('common.loading')}
          </p>
        )}
      </div>

      <p className="text-meta text-ink-soft">
        {t('stock.hint')}
      </p>
    </div>
  )
}

function Stat({ value, label, tone }: { value: string; label: string; tone: 'rust' | 'ink' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`font-display text-[22px] font-bold leading-none ${tone === 'rust' ? 'text-rust' : ''}`}
      >
        {value}
      </span>
      <span className="text-meta text-ink-soft">{label}</span>
    </div>
  )
}
