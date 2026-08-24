import { Link } from 'react-router-dom'
import { Ltr, useT } from '../lib/i18n'

const PHONE_DISPLAY = '0561 20 44 90'
const PHONE_TEL = '0561204490'

// Only pages that actually exist get a link. "Suivi de commande" and "Guide des
// tailles" have no page yet, so they render as plain text rather than pretending
// to go somewhere.
const LINKS: Array<{ key: 'nav.livraison' | 'nav.contact' | 'footer.tracking' | 'footer.sizeGuide'; to: string | null }> = [
  { key: 'nav.livraison', to: '/livraison' },
  { key: 'nav.contact', to: '/contact' },
  { key: 'footer.tracking', to: null },
  { key: 'footer.sizeGuide', to: null },
]

export function Footer() {
  const { t } = useT()
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-shell flex-col gap-[18px] px-gutter py-8 lg:px-gutter-lg lg:py-section">
        <span className="wordmark text-[19px]">Casbah</span>

        <div className="flex flex-col gap-2 text-sm">
          <span>
            {t('footer.orders')}{' '}
            <a href={`tel:${PHONE_TEL}`} className="font-semibold text-green hover:text-rust">
              <Ltr>{PHONE_DISPLAY}</Ltr>
            </a>
          </span>
          <span className="text-ink-soft">{t('footer.hours')}</span>
          <span className="text-ink-soft">{t('footer.returns')}</span>
        </div>

        <div className="flex flex-wrap gap-[14px] border-t border-line pt-[14px] text-meta">
          {LINKS.map(({ key, to }) =>
            to ? (
              <Link key={key} to={to} className="text-green hover:text-rust">
                {t(key)}
              </Link>
            ) : (
              <span key={key} className="text-ink-soft" title={t('footer.soon')}>
                {t(key)}
              </span>
            ),
          )}
        </div>
      </div>
    </footer>
  )
}
