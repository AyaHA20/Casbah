import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ApiError,
  adminApi,
  type AdminOrderDetail,
  type AdminOrderList,
  type AdminStats,
  type OrderStatus,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDA, fmtPhone } from '../../lib/format'
import { DELIVERY_LABEL, STATUS_LABEL, STATUS_TONE, TABS, telHref } from '../../lib/status'
import { OrderPanel } from '../../components/admin/OrderPanel'

export function AdminCommandes() {
  const { token, signOut } = useAuth()
  const [params, setParams] = useSearchParams()

  const tab = (params.get('tab') ?? 'ALL') as 'ALL' | OrderStatus
  const phone = params.get('phone') ?? ''
  const selectedId = params.get('order') ? Number(params.get('order')) : null

  const [list, setList] = useState<AdminOrderList | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState(phone)

  // A 401 anywhere means the 12h session lapsed — drop it so the router sends
  // them back to the login screen instead of showing empty tables.
  const guard = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') signOut()
      setError(e instanceof Error ? e.message : 'Erreur inconnue.')
    },
    [signOut],
  )

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setError(null)
      const [l, s] = await Promise.all([
        adminApi.listOrders(token, {
          ...(tab !== 'ALL' ? { status: tab } : {}),
          ...(phone ? { phone } : {}),
          limit: 50,
        }),
        adminApi.stats(token),
      ])
      setList(l)
      setStats(s)
    } catch (e) {
      guard(e)
    }
  }, [token, tab, phone, guard])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!token || selectedId === null) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    adminApi
      .getOrder(token, selectedId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch(guard)
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, selectedId, guard])

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params)
      if (value) next.set(key, value)
      else next.delete(key)
      setParams(next)
    },
    [params, setParams],
  )

  async function changeStatus(status: OrderStatus) {
    if (!token || selectedId === null) return
    const updated = await adminApi.setStatus(token, selectedId, status)
    setDetail(updated)
    await refresh()
  }

  const tabCount = useMemo(
    () => (key: 'ALL' | OrderStatus) =>
      key === 'ALL' ? (list?.counts.all ?? 0) : (list?.counts.byStatus[key] ?? 0),
    [list],
  )

  const rows = list?.data ?? []

  return (
    <>
      {/* ---------------- Main column ---------------- */}
      <div className="flex flex-col gap-6 px-gutter py-7 lg:px-10 lg:pb-14 lg:pt-9">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="text-[32px] lg:text-[42px]">Commandes</h1>

          {/* Stats row — the design's three cells */}
          <div className="grid grid-cols-3 gap-3 lg:flex lg:gap-10">
            <Stat value={String(stats?.pending ?? '—')} label="à traiter" />
            <Stat
              value={stats ? fmtDA(stats.collected7d) : '—'}
              label="encaissés (7 j)"
            />
            <Stat
              value={
                stats ? `${(stats.returnRate * 100).toLocaleString('fr-DZ', { maximumFractionDigits: 1 })} %` : '—'
              }
              label="retours"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:gap-[10px] lg:pb-0">
            {TABS.map((t) => {
              const on = tab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setParam('tab', t.key === 'ALL' ? null : t.key)}
                  className={`whitespace-nowrap rounded-pill border px-4 py-[11px] text-meta font-semibold ${
                    on ? 'border-green bg-green text-cream' : 'border-line text-ink-soft'
                  }`}
                >
                  {t.label} · {tabCount(t.key)}
                </button>
              )
            })}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              setParam('phone', search.trim() || null)
            }}
            className="lg:w-[280px]"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un téléphone — 0561…"
              inputMode="tel"
              className="w-full rounded-[12px] border border-line bg-field px-[14px] py-[11px] text-sm outline-none focus:border-green"
            />
          </form>
        </div>

        {error && (
          <p className="rounded-md border border-rust/40 bg-rust/5 p-4 text-body text-rust">
            {error}
          </p>
        )}

        {/* ---- Desktop table ---- */}
        <div className="hidden lg:block">
          <div className="grid grid-cols-[110px_1.3fr_140px_1fr_110px_120px] gap-5 border-b border-ink py-3 text-label font-semibold uppercase text-ink-soft">
            <span>N°</span>
            <span>Client</span>
            <span>Téléphone</span>
            <span>Wilaya / mode</span>
            <span className="text-right">Total</span>
            <span className="text-right">Statut</span>
          </div>
          {rows.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setParam('order', String(o.id))}
              className={`grid w-full grid-cols-[110px_1.3fr_140px_1fr_110px_120px] items-center gap-5 border-b border-line py-[18px] text-left text-sm ${
                o.id === selectedId ? 'bg-cream/40' : ''
              }`}
            >
              <span className="font-semibold">{o.orderNumber}</span>
              <span>{o.customerName}</span>
              <span>{fmtPhone(o.phone)}</span>
              <span className="text-ink-soft">
                {o.wilaya.nameFr} · {DELIVERY_LABEL[o.deliveryType]}
              </span>
              <span className="text-right font-display text-[17px] font-bold">
                {fmtDA(o.total)}
              </span>
              <span className={`text-right font-semibold ${STATUS_TONE[o.status]}`}>
                {STATUS_LABEL[o.status]}
              </span>
            </button>
          ))}
        </div>

        {/* ---- Mobile cards ---- */}
        <div className="flex flex-col lg:hidden">
          {rows.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setParam('order', String(o.id))}
              className={`flex flex-col gap-2 border-t border-line py-4 text-left ${
                o.id === selectedId ? 'bg-cream/40' : ''
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-semibold">{o.orderNumber}</span>
                <span className="font-display text-[18px] font-bold">{fmtDA(o.total)}</span>
              </div>
              <span className="text-meta">
                {o.customerName} ·{' '}
                <a
                  href={telHref(o.phone)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-green"
                >
                  {fmtPhone(o.phone)}
                </a>
              </span>
              <div className="flex justify-between text-xs text-ink-soft">
                <span>
                  {o.wilaya.nameFr} · {o.commune.name} · {DELIVERY_LABEL[o.deliveryType]}
                </span>
                <span className={`font-semibold ${STATUS_TONE[o.status]}`}>
                  {STATUS_LABEL[o.status]}
                </span>
              </div>
            </button>
          ))}
        </div>

        {list && rows.length === 0 && (
          <p className="py-10 text-center text-ink-soft">
            {phone ? `Aucune commande pour « ${phone} ».` : 'Aucune commande dans cet onglet.'}
          </p>
        )}

        {list && rows.length > 0 && (
          <span className="text-meta text-ink-soft">
            {rows.length} commande{rows.length > 1 ? 's' : ''} sur {list.pagination.total}
          </span>
        )}
      </div>

      {/* ---------------- Detail panel ---------------- */}
      <aside className="border-t border-line bg-cream/40 lg:min-h-[760px] lg:border-l lg:border-t-0">
        <OrderPanel order={detail} loading={detailLoading} onStatusChange={changeStatus} />
      </aside>
    </>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-line p-3 lg:border-0 lg:p-0">
      <span className="font-display text-[22px] font-bold leading-none lg:text-[24px]">
        {value}
      </span>
      <span className="text-xs text-ink-soft lg:text-meta">{label}</span>
    </div>
  )
}
