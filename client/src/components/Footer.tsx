import { Link } from 'react-router-dom'

const PHONE_DISPLAY = '0561 20 44 90'
const PHONE_TEL = '0561204490'

// Only pages that actually exist get a link. "Suivi de commande" and "Guide des
// tailles" have no page yet, so they render as plain text rather than pretending
// to go somewhere.
const LINKS: Array<{ label: string; to: string | null }> = [
  { label: 'Livraison', to: '/livraison' },
  { label: 'Contact', to: '/contact' },
  { label: 'Suivi de commande', to: null },
  { label: 'Guide des tailles', to: null },
]

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-shell flex-col gap-[18px] px-gutter py-8 lg:px-gutter-lg lg:py-section">
        <span className="wordmark text-[19px]">Casbah</span>

        <div className="flex flex-col gap-2 text-sm">
          <span>
            Commandes &amp; SAV :{' '}
            <a href={`tel:${PHONE_TEL}`} className="font-semibold text-green hover:text-rust">
              {PHONE_DISPLAY}
            </a>
          </span>
          <span className="text-ink-soft">Samedi – jeudi, 9h – 18h</span>
          <span className="text-ink-soft">Retour ou échange sous 7 jours, article non porté.</span>
        </div>

        <div className="flex flex-wrap gap-[14px] border-t border-line pt-[14px] text-meta">
          {LINKS.map(({ label, to }) =>
            to ? (
              <Link key={label} to={to} className="text-green hover:text-rust">
                {label}
              </Link>
            ) : (
              <span key={label} className="text-ink-soft" title="Bientôt disponible">
                {label}
              </span>
            ),
          )}
        </div>
      </div>
    </footer>
  )
}
