import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useCart } from '../lib/cart'
import { useT } from '../lib/i18n'
import { Ltr } from '../lib/i18n'
import { LangToggle } from './LangToggle'

const PHONE_DISPLAY = '0561 20 44 90'
const PHONE_TEL = '0561204490'

const NAV = [
  { to: '/?category=femme', key: 'nav.femme' },
  { to: '/?category=homme', key: 'nav.homme' },
  { to: '/?category=nouveautes', key: 'nav.nouveautes' },
  { to: '/livraison', key: 'nav.livraison' },
  { to: '/contact', key: 'nav.contact' },
] as const

export function Header() {
  const { count } = useCart()
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Navigating should always close the drawer, including when the click was on
  // the link for the page you are already on.
  useEffect(() => {
    setOpen(false)
  }, [location.key])

  return (
    <header className="border-b border-line">
      {/* ---------- Mobile ---------- */}
      <div className="mx-auto flex max-w-shell items-center justify-between px-gutter py-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? t('nav.menuClose') : t('nav.menuOpen')}
          className="font-display text-xl leading-none text-green"
        >
          {open ? '✕' : '☰'}
        </button>
        <Link to="/" className="wordmark text-[19px] text-ink">
          Casbah
        </Link>
        <div className="flex items-center gap-2">
          <LangToggle compact />
          <Link to="/commande" className="text-meta font-medium text-green">
            {t('nav.cart')} · {count}
          </Link>
        </div>
      </div>

      {open && (
        <nav
          id="menu-mobile"
          className="border-t border-line px-gutter pb-5 pt-2 lg:hidden"
        >
          <ul className="flex flex-col">
            {NAV.map((item) => (
              <li key={item.to} className="border-b border-line last:border-b-0">
                <NavLink
                  to={item.to}
                  className="block py-[14px] font-display text-[22px] font-bold uppercase text-ink"
                >
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
          <a
            href={`tel:${PHONE_TEL}`}
            className="mt-4 block rounded-pill border border-green py-3 text-center text-sm font-semibold text-green"
          >
            {t('nav.call')} <Ltr>{PHONE_DISPLAY}</Ltr>
          </a>
        </nav>
      )}

      {/* ---------- Desktop ---------- */}
      <div className="mx-auto hidden max-w-shell items-center justify-between px-gutter-lg py-5 lg:flex">
        <Link to="/" className="wordmark text-[22px] tracking-[0.18em] text-ink">
          Casbah
        </Link>
        <nav className="flex gap-[34px] text-[15px] font-medium">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="text-ink hover:text-green">
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-[22px] text-sm font-medium">
          <a href={`tel:${PHONE_TEL}`} className="text-ink hover:text-green">
            <Ltr>{PHONE_DISPLAY}</Ltr>
          </a>
          <LangToggle />
          <Link
            to="/commande"
            className="rounded-pill border border-green px-[18px] py-[9px] text-green hover:bg-green hover:text-cream"
          >
            {t('nav.cart')} · {count}
          </Link>
        </div>
      </div>
    </header>
  )
}
