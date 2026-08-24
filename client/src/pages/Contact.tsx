import { useT } from '../lib/i18n'
const PHONE_DISPLAY = '0561 20 44 90'
const PHONE_TEL = '0561204490'

export function Contact() {
  const { t } = useT()
  return (
    <section className="mx-auto max-w-shell px-gutter pb-section pt-7 lg:px-gutter-lg lg:py-section">
      <span className="wordmark text-meta text-green lg:text-[15px]">{t('contact.title')}</span>
      <h1 className="mt-4 text-h1 lg:text-display">
        {t('contact.title')}
      </h1>
      <p className="mt-5 max-w-measure text-body lg:text-lead">
        {t('contact.intro')}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="flex flex-col gap-4 rounded-lg border border-green p-6 lg:p-8">
          <span className="text-label font-semibold uppercase text-ink-soft">{t('contact.phone')}</span>
          <a
            href={`tel:${PHONE_TEL}`}
            className="font-display text-[34px] font-bold leading-none text-green lg:text-[44px]"
          >
            {PHONE_DISPLAY}
          </a>
          <a
            href={`tel:${PHONE_TEL}`}
            className="rounded-pill border border-green bg-green py-3 text-center text-sm font-semibold text-cream"
          >
            {t('contact.callNow')}
          </a>
          <span className="text-meta text-ink-soft">{t('footer.hours')}</span>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-2">
          <dl className="flex flex-col gap-3 border-t border-line pt-5 text-body">
            {[
              ['Commandes & SAV', PHONE_DISPLAY],
              ['Horaires', t('contact.hoursValue')],
              ['Atelier', 'Bab Azoun, Alger Centre'],
              [t('contact.returnsLabel'), t('contact.returnsDetail')],
              ['Paiement', t('contact.paymentDetail')],
            ].map(([term, value]) => (
              <div key={term} className="flex justify-between gap-6 border-b border-line pb-3">
                <dt className="text-ink-soft">{term}</dt>
                <dd className="text-end font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-2 max-w-measure text-meta text-ink-soft">
            {t('contact.trackingNote')}
          </p>
        </div>
      </div>
    </section>
  )
}
