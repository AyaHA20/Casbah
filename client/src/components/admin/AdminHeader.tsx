import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { LangToggle } from '../LangToggle'
import { useT } from '../../lib/i18n'

// The design's admin nav. Every item is a real page now.
const NAV: Array<{ key: 'admin.orders' | 'admin.products' | 'admin.stock' | 'vitrine.title' | 'admin.shipping'; to: string | null }> = [
  { key: 'admin.orders', to: '/admin/commandes' },
  { key: 'admin.products', to: '/admin/produits' },
  { key: 'admin.stock', to: '/admin/stock' },
  { key: 'vitrine.title', to: '/admin/vitrine' },
  { key: 'admin.shipping', to: '/admin/livraison' },
]


export function AdminHeader({ now }: { now: Date }) {
  const { t, locale } = useT()
  // Built per render so a language switch reformats immediately.
  const DATE_FMT = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const TIME_FMT = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const { signOut, admin } = useAuth()

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-3 px-gutter py-4 lg:px-10 lg:py-5">
        <div className="flex items-baseline gap-5">
          <Link to="/admin" className="wordmark text-[19px] tracking-[0.18em]">
            Casbah
          </Link>
          <span className="text-sm font-medium text-ink-soft">{t('admin.title')}</span>
        </div>

        <nav className="order-3 flex w-full gap-5 overflow-x-auto text-sm font-medium lg:order-none lg:w-auto lg:gap-7">
          {NAV.map(({ key, to }) =>
            to ? (
              <NavLink
                key={key}
                to={to}
                className={({ isActive }) =>
                  `whitespace-nowrap ${isActive ? 'text-green' : 'text-ink hover:text-green'}`
                }
              >
                {t(key)}
              </NavLink>
            ) : (
              <span key={key} title={t('footer.soon')} className="whitespace-nowrap text-line">
                {t(key)}
              </span>
            ),
          )}
        </nav>

        <div className="flex items-center gap-4">
          {admin?.readOnly && (
            <span
              title={t('demo.readOnlyHint')}
              className="rounded-pill border border-rust px-2.5 py-1 text-[11px] font-semibold text-rust"
            >
              {t('demo.readOnly')}
            </span>
          )}
          <LangToggle compact />
          <span className="hidden text-meta text-ink-soft lg:inline">
            {DATE_FMT.format(now)} · {TIME_FMT.format(now)}
          </span>
          <button
            type="button"
            onClick={signOut}
            title={admin?.email ?? ''}
            className="rounded-pill border border-line min-h-11 px-4 text-meta text-ink-soft hover:border-green hover:text-green"
          >
            {t('admin.quit')}
          </button>
        </div>
      </div>
    </header>
  )
}
