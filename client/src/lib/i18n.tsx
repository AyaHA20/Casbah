import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fr, type Dict } from './dictionary'
import { ar } from './dictionary.ar'

export type Lang = 'fr' | 'ar'
export type Dir = 'ltr' | 'rtl'

const STORAGE_KEY = 'casbah.lang.v1'
const DICTS: Record<Lang, Dict> = { fr, ar }

type Value = {
  lang: Lang
  dir: Dir
  setLang: (l: Lang) => void
  /** Look up a UI string. A missing key is a compile error, not a blank screen. */
  t: <K extends keyof Dict>(key: K) => string
  /** BCP-47 tag for Intl. Algeria uses Latin digits, so no -u-nu override. */
  locale: string
}

const LangContext = createContext<Value | null>(null)

function load(): Lang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'ar' || raw === 'fr' ? raw : 'fr'
  } catch {
    return 'fr'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(load)
  const dir: Dir = lang === 'ar' ? 'rtl' : 'ltr'

  // The whole layout mirrors off these two attributes; every logical-property
  // class in the app resolves against them.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('lang', lang)
    root.setAttribute('dir', dir)
  }, [lang, dir])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A browser refusing storage must not break the toggle.
    }
  }, [])

  const value = useMemo<Value>(() => {
    const dict = DICTS[lang]
    return {
      lang,
      dir,
      setLang,
      t: (key) => dict[key],
      locale: lang === 'ar' ? 'ar-DZ' : 'fr-DZ',
    }
  }, [lang, dir, setLang])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useT(): Value {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useT must be used inside <LangProvider>')
  return ctx
}

/**
 * Wraps text that must stay left-to-right inside an RTL paragraph.
 *
 * Phone numbers, order numbers and SKUs are Latin sequences; without isolation
 * the bidi algorithm reorders their punctuation and "CMD-2026-0001" renders as
 * "0001-2026-CMD". This is the failure people notice last and trust least.
 */
export function Ltr({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
      {children}
    </span>
  )
}

/**
 * Picks the Arabic value when the interface is Arabic AND a translation exists,
 * otherwise the French one.
 *
 * The fallback lives here so no caller has to remember it: a product whose
 * nameAr was never written must still render its French name, never an empty
 * string. Product content is hand-written, so half-translated catalogues are
 * the normal state, not an edge case.
 */
export function localized(fr: string, ar: string | null | undefined, lang: Lang): string {
  if (lang === 'ar' && ar && ar.trim() !== '') return ar
  return fr
}
