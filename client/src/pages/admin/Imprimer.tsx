import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { adminApi, api, type AdminOrderDetail } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDA, fmtPhone } from '../../lib/format'
import { DELIVERY_KEY, STATUS_KEY } from '../../lib/status'
import { Ltr, useT } from '../../lib/i18n'

export function AdminImprimer() {
  const { t, lang, locale } = useT()
  // Rebuilt per render so switching language reformats the sheet immediately.
  const DATE_FMT = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const { id } = useParams()
  const { token } = useAuth()
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Configurable target: the shop site, an Instagram page, anything.
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    if (!token || !id) return
    adminApi
      .getOrder(token, Number(id))
      .then(setOrder)
      .catch((e: Error) => setError(e.message))
  }, [token, id])

  useEffect(() => {
    api
      .getStorefront()
      .then((s) => setQrUrl(s.qrUrl))
      .catch(() => setQrUrl(''))
  }, [])

  if (error) return <p className="p-8 text-rust">{error}</p>
  if (!order) return <p className="p-8 text-ink-soft">{t('common.loading')}</p>

  return (
    <>
      {/* Print geometry can't be expressed in utilities, and index.css is the
          design-token file — so the @page rule lives here with the one page
          that needs it. */}
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          html, body { background: #fff !important; }
        }
      `}</style>

      <div className="mx-auto max-w-[820px] p-gutter lg:p-10">
        {/* Screen-only toolbar */}
        <div className="mb-8 flex items-center justify-between print:hidden">
          <Link to={`/admin/commandes?order=${order.id}`} className="text-meta text-green">
            <span className="inline-block rtl:-scale-x-100">←</span> {t('print.back')}
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-pill border border-green bg-green px-6 py-3 text-sm font-semibold text-cream"
          >
            {t('print.print')}
          </button>
        </div>

        {/* ---------- Sheet ---------- */}
        <header className="flex items-start justify-between border-b border-ink pb-5">
          <div>
            <div className="wordmark text-[22px]">Casbah</div>
            <div className="text-meta text-ink-soft">{t('print.docTitle')}</div>
          </div>
          <div className="text-end">
            <div className="font-display text-[30px] font-bold leading-none">
              <Ltr>{order.orderNumber}</Ltr>
            </div>
            <div className="text-meta text-ink-soft">{DATE_FMT.format(new Date(order.createdAt))}</div>
            <div className="text-meta text-ink-soft">{t(STATUS_KEY[order.status])}</div>
          </div>
        </header>

        <section className="grid gap-8 border-b border-line py-6 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-label font-semibold uppercase text-ink-soft">{t('print.customer')}</h2>
            <div className="text-[17px] font-semibold">{order.customerName}</div>
            <div className="text-body"><Ltr>{fmtPhone(order.phone)}</Ltr></div>
            {order.customer.returnedCount > 0 && (
              <div className="text-meta font-semibold text-rust">
                {t('orders.returnedN')} {order.customer.returnedCount} {t('orders.ordersWord')}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-label font-semibold uppercase text-ink-soft">{t('print.delivery')}</h2>
            <div className="text-body">
              {t(DELIVERY_KEY[order.deliveryType])}
            </div>
            <div className="text-body">{order.address}</div>
            <div className="text-body font-medium">
              {order.commune.name} — {order.wilaya.code}{' '}
              {lang === 'ar' ? order.wilaya.nameAr : order.wilaya.nameFr}
            </div>
            {order.notes && <div className="text-meta text-ink-soft">{t('orders.note')} : {order.notes}</div>}
          </div>
        </section>

        <section className="py-6">
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="border-b border-ink text-label font-semibold uppercase text-ink-soft">
                <th className="py-2 font-semibold">{t('print.item')}</th>
                <th className="py-2 font-semibold">{t('print.sizeColor')}</th>
                <th className="py-2 text-center font-semibold">{t('print.qty')}</th>
                <th className="py-2 text-end font-semibold">{t('print.lineTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-3 text-body">
                    {item.productName}
                    <div className="text-xs text-ink-soft"><Ltr>{item.sku}</Ltr></div>
                  </td>
                  <td className="py-3 text-body">
                    {item.variantSize} / {item.variantColor}
                  </td>
                  <td className="py-3 text-center text-body">{item.quantity}</td>
                  <td className="py-3 text-end text-body">
                    {fmtDA(item.unitPrice * item.quantity, lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ms-auto flex w-full max-w-[340px] flex-col gap-2">
          <div className="flex justify-between text-body">
            <span className="text-ink-soft">{t('checkout.subtotal')}</span>
            <span>{fmtDA(order.subtotal, lang)}</span>
          </div>
          <div className="flex justify-between text-body">
            <span className="text-ink-soft">{t('checkout.shipping')}</span>
            <span>{fmtDA(order.shipping, lang)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink pt-3">
            <span className="text-[15px] font-semibold uppercase">{t('orders.toCollect')}</span>
            <span className="font-display text-[42px] font-bold leading-none">
              {fmtDA(order.total, lang)}
            </span>
          </div>
          <p className="text-meta text-ink-soft">
            {t('print.cash')}
          </p>
        </section>

        {/* Corner QR: only rendered when a target is configured, so an unset
            setting leaves the sheet exactly as it was. */}
        {qrUrl && (
          <div className="mt-8 flex items-center justify-end gap-3">
            <span className="text-meta text-ink-soft" dir="ltr">
              {qrUrl.replace(/^https?:\/\//, '')}
            </span>
            <QRCodeSVG value={qrUrl} size={72} level="M" marginSize={0} />
          </div>
        )}

        <footer className="mt-10 border-t border-line pt-4 text-meta text-ink-soft">
          Casbah · <Ltr>0561 20 44 90</Ltr> · {t('footer.hours')} · {t('footer.returns')}
        </footer>
      </div>
    </>
  )
}
