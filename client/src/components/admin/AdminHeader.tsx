import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

// The design's admin nav. Only Commandes exists as a page in this phase; the
// other three render as inert text rather than links that go nowhere.
const NAV = ['Commandes', 'Produits', 'Stock', 'Livraison']

const DATE_FMT = new Intl.DateTimeFormat('fr-DZ', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const TIME_FMT = new Intl.DateTimeFormat('fr-DZ', { hour: '2-digit', minute: '2-digit' })

export function AdminHeader({ now }: { now: Date }) {
  const { signOut, admin } = useAuth()

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-3 px-gutter py-4 lg:px-10 lg:py-5">
        <div className="flex items-baseline gap-5">
          <Link to="/admin" className="wordmark text-[19px] tracking-[0.18em]">
            Casbah
          </Link>
          <span className="text-sm font-medium text-ink-soft">Administration</span>
        </div>

        <nav className="order-3 flex w-full gap-5 overflow-x-auto text-sm font-medium lg:order-none lg:w-auto lg:gap-7">
          {NAV.map((label) =>
            label === 'Commandes' ? (
              <Link key={label} to="/admin" className="whitespace-nowrap text-green">
                {label}
              </Link>
            ) : (
              <span
                key={label}
                title="Bientôt disponible"
                className="whitespace-nowrap text-line"
              >
                {label}
              </span>
            ),
          )}
        </nav>

        <div className="flex items-center gap-4">
          <span className="hidden text-meta text-ink-soft lg:inline">
            {DATE_FMT.format(now)} · {TIME_FMT.format(now)}
          </span>
          <button
            type="button"
            onClick={signOut}
            title={admin?.email ?? ''}
            className="rounded-pill border border-line px-3 py-1.5 text-meta text-ink-soft hover:border-green hover:text-green"
          >
            Quitter
          </button>
        </div>
      </div>
    </header>
  )
}
