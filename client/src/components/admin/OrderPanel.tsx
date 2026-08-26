import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminOrderDetail, OrderStatus } from '../../lib/api'
import { CustomerBadge } from './CustomerBadge'
import { fmtDA, fmtPhone } from '../../lib/format'
import { DELIVERY_KEY, RESTORING_STATUSES, STATUS_KEY, telHref } from '../../lib/status'
import { Ltr, useT } from '../../lib/i18n'

type Props = {
  order: AdminOrderDetail | null
  loading: boolean
  onStatusChange: (status: OrderStatus) => Promise<void>
}

export function OrderPanel({ order, loading, onStatusChange }: Props) {
  const { t, lang, locale } = useT()
  const TIME_FMT = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A terminal move is irreversible AND moves stock, so it gets a confirm step.
  // Non-terminal moves stay one click — they are all reversible by moving on.
  const [confirming, setConfirming] = useState<OrderStatus | null>(null)

  if (loading) {
    return <p className="p-8 text-center text-ink-soft">{t('common.loading')}</p>
  }

  if (!order) {
    return (
      <p className="p-8 text-center text-meta text-ink-soft">
        {t('orders.selectOne')}
      </p>
    )
  }

  async function change(next: string) {
    if (!next) return
    setPending(true)
    setError(null)
    try {
      await onStatusChange(next as OrderStatus)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Changement impossible.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-[22px] p-gutter lg:p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[26px] lg:text-[34px]"><Ltr>{order.orderNumber}</Ltr></h2>
        <span className="text-meta text-ink-soft">
          {t('orders.received')} {TIME_FMT.format(new Date(order.createdAt))}
        </span>
      </div>

      <dl className="flex flex-col gap-[10px] border-t border-line pt-[18px] text-sm lg:text-[15px]">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-soft">{t('orders.customer')}</dt>
          <dd className="flex flex-col items-end text-end">
            {order.customerName}
            <CustomerBadge customer={order.customer} size="md" />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-soft">{t('orders.phone')}</dt>
          <dd>
            {/* tel: so the shop can tap to call straight from the panel */}
            <a href={telHref(order.phone)} className="font-semibold text-green hover:text-rust">
              <Ltr>{fmtPhone(order.phone)}</Ltr>
            </a>
          </dd>
        </div>
        <Row
          label={t('checkout.wilaya')}
          value={`${order.wilaya.code} — ${lang === 'ar' ? order.wilaya.nameAr : order.wilaya.nameFr}`}
        />
        <Row label={t('orders.commune')} value={order.commune.name} />
        <Row
          label={t('orders.mode')}
          value={t(DELIVERY_KEY[order.deliveryType])}
        />
        <div className="flex justify-between gap-6">
          <dt className="flex-none text-ink-soft">{t('orders.address')}</dt>
          <dd className="text-end">{order.address}</dd>
        </div>
        {order.notes && <Row label={t('orders.note')} value={order.notes} />}
      </dl>

      <div className="flex flex-col gap-[10px] border-t border-line pt-[18px] text-sm lg:text-[15px]">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-4">
            <span>
              {item.productName} — {item.variantSize} / {item.variantColor}
              {item.quantity > 1 && ` ×${item.quantity}`}
            </span>
            <span className="whitespace-nowrap">{fmtDA(item.unitPrice * item.quantity, lang)}</span>
          </div>
        ))}
        <div className="flex justify-between">
          <span className="text-ink-soft">
            {t('orders.mode')} · {t(DELIVERY_KEY[order.deliveryType])}
          </span>
          <span>{fmtDA(order.shipping, lang)}</span>
        </div>
        <div className="flex items-baseline justify-between border-t border-ink pt-3">
          <span className="font-semibold">{t('orders.toCollect')}</span>
          <span className="font-display text-[24px] font-bold lg:text-[30px]">
            {fmtDA(order.total, lang)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="statut" className="text-meta text-ink-soft">
          {t('orders.statusLabel')}
        </label>
        <select
          id="statut"
          value=""
          disabled={pending || order.allowedTransitions.length === 0}
          onChange={(e) => {
            const next = e.target.value as OrderStatus | ''
            if (!next) return
            if (RESTORING_STATUSES.includes(next)) setConfirming(next)
            else void change(next)
          }}
          className="w-full appearance-none rounded-[12px] border border-green bg-cream p-[13px] text-sm font-semibold text-ink disabled:border-line disabled:bg-field disabled:text-ink-soft lg:p-[14px] lg:text-[15px]"
        >
          <option value="">
            {t(STATUS_KEY[order.status])}
            {order.allowedTransitions.length === 0 ? ` — ${t('orders.finalState')}` : ` — ${t('orders.changeTo')}`}
          </option>
          {/* Only legal moves appear. The server enforces the same table. */}
          {order.allowedTransitions.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_KEY[s])}
            </option>
          ))}
        </select>

        {confirming && (
          <div className="flex flex-col gap-2.5 rounded-md border border-rust bg-rust/5 p-3.5">
            <span className="text-meta font-bold text-rust">
              {t('orders.terminalTitle')} — {t(STATUS_KEY[confirming])}
            </span>
            <span className="text-meta text-ink">{t('orders.terminalBody')}</span>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const next = confirming
                  setConfirming(null)
                  void change(next)
                }}
                className="rounded-pill border border-rust bg-rust min-h-11 px-4 text-meta font-semibold text-cream disabled:border-line disabled:bg-line"
              >
                {t('orders.terminalConfirm')}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="text-meta text-ink-soft hover:text-ink"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {order.stockRestored && (
          <span className="text-meta text-ink-soft">
            {t('orders.stockRestored')}
          </span>
        )}
        {error && (
          <span className="rounded-md border border-rust/40 bg-rust/5 p-2.5 text-meta text-rust">
            {error}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <a
          href={telHref(order.phone)}
          className="flex-1 rounded-pill border border-green bg-green py-[14px] text-center text-sm font-semibold text-cream lg:py-[15px] lg:text-[15px]"
        >
          {t('orders.callCustomer')}
        </a>
        <Link
          to={`/admin/commandes/${order.id}/imprimer`}
          title={t('a11y.printSheet')}
          className="grid h-12 flex-none place-items-center rounded-pill border border-green px-5 text-sm font-semibold text-green lg:h-[52px]"
        >
          {t('orders.print')}
        </Link>
      </div>

      <p className="text-meta leading-[1.6] text-ink-soft">
        {t('orders.confirmFirst')}
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-end">{value}</dd>
    </div>
  )
}
