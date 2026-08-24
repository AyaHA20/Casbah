import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ApiError,
  adminApi,
  describeError,
  type AdminOrderDetail,
  type AdminOrderList,
  type AdminStats,
  type OrderStatus,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDA, fmtPhone } from '../../lib/format'
import { DELIVERY_KEY, STATUS_KEY, STATUS_TONE, TABS, telHref } from '../../lib/status'
import { Ltr, useT } from '../../lib/i18n'
import { OrderPanel } from '../../components/admin/OrderPanel'
import { CustomerBadge } from '../../components/admin/CustomerBadge'

export function AdminCommandes() {
  const { t, lang, locale } = useT()
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
      setError(describeError(e))
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
          <h1 className="text-[32px] lg:text-[42px]">{t('admin.orders')}</h1>

          {/* Stats row — the design's three cells */}
          <div className="grid grid-cols-3 gap-3 lg:flex lg:gap-10">
            <Stat value={String(stats?.pending ?? '—')} label={t('orders.toProcess')} />
            <Stat
              value={stats ? fmtDA(stats.collected7d, lang) : '—'}
              label={t('orders.collected7d')}
            />
            <Stat
              value={
                stats ? `${(stats.returnRate * 100).toLocaleString(locale, { maximumFractionDigits: 1 })} %` : '—'
              }
              label={t('orders.returnRate')}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:gap-[10px] lg:pb-0">
            {TABS.map((tab_) => {
              const on = tab === tab_.key
              return (
                <button
                  key={tab_.key}
                  type="button"
                  onClick={() => setParam('tab', tab_.key === 'ALL' ? null : tab_.key)}
                  className={`whitespace-nowrap rounded-pill border px-4 py-[11px] text-meta font-semibold ${
                    on ? 'border-green bg-green text-cream' : 'border-line text-ink-soft'
                  }`}
                >
                  {t(tab_.labelKey)} · {tabCount(tab_.key)}
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
              placeholder={t('orders.searchPhone')}
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
            <span>{t('orders.number')}</span>
            <span>{t('orders.customer')}</span>
            <span>{t('orders.phone')}</span>
            <span>{t('orders.wilayaMode')}</span>
            <span className="text-end">{t('orders.total')}</span>
            <span className="text-end">{t('orders.status')}</span>
          </div>
          {rows.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setParam('order', String(o.id))}
              className={`grid w-full grid-cols-[110px_1.3fr_140px_1fr_110px_120px] items-center gap-5 border-b border-line py-[18px] text-start text-sm ${
                o.id === selectedId ? 'bg-cream/40' : ''
              }`}
            >
              <span className="font-semibold"><Ltr>{o.orderNumber}</Ltr></span>
              <span className="flex flex-col gap-0.5">
                {o.customerName}
                <CustomerBadge customer={o.customer} />
              </span>
              <span><Ltr>{fmtPhone(o.phone)}</Ltr></span>
              <span className="text-ink-soft">
                {lang === 'ar' ? o.wilaya.nameAr : o.wilaya.nameFr} · {t(DELIVERY_KEY[o.deliveryType])}
              </span>
              <span className="text-end font-display text-[17px] font-bold">
                {fmtDA(o.total, lang)}
              </span>
              <span className={`text-end font-semibold ${STATUS_TONE[o.status]}`}>
                {t(STATUS_KEY[o.status])}
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
              className={`flex flex-col gap-2 border-t border-line py-4 text-start ${
                o.id === selectedId ? 'bg-cream/40' : ''
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-semibold">{o.orderNumber}</span>
                <span className="font-display text-[18px] font-bold">{fmtDA(o.total, lang)}</span>
              </div>
              <span className="text-meta">
                {o.customerName} ·{' '}
                <a
                  href={telHref(o.phone)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-green"
                >
                  <Ltr>{fmtPhone(o.phone)}</Ltr>
                </a>
              </span>
              <CustomerBadge customer={o.customer} />
              <div className="flex justify-between text-xs text-ink-soft">
                <span>
                  {lang === 'ar' ? o.wilaya.nameAr : o.wilaya.nameFr} · {o.commune.name} ·{' '}
                  {t(DELIVERY_KEY[o.deliveryType])}
                </span>
                <span className={`font-semibold ${STATUS_TONE[o.status]}`}>
                  {t(STATUS_KEY[o.status])}
                </span>
              </div>
            </button>
          ))}
        </div>

        {list && rows.length === 0 && (
          <p className="py-10 text-center text-ink-soft">
            {phone ? t('orders.noneForPhone') : t('orders.emptyTab')}
          </p>
        )}

        {list && rows.length > 0 && (
          <span className="text-meta text-ink-soft">
            {rows.length} commande{rows.length > 1 ? 's' : ''} sur {list.pagination.total}
          </span>
        )}
      </div>

      {/* ---------------- Detail panel ---------------- */}
      <aside className="border-t border-line bg-cream/40 lg:min-h-[760px] lg:border-s lg:border-t-0">
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
