import { useT, type Lang } from '../lib/i18n'

const OPTIONS: Lang[] = ['fr', 'ar']

/**
 * FR / AR switch. Sets `dir` on <html>, so the entire layout mirrors from one
 * click — every direction-sensitive class in the app is a logical property.
 */
export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useT()

  return (
    <div
      role="group"
      aria-label={t('lang.switch')}
      className={`inline-flex overflow-hidden rounded-pill border border-line ${compact ? 'text-[11px]' : 'text-meta'}`}
    >
      {OPTIONS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          lang={code}
          className={`px-2.5 py-1 font-semibold ${
            lang === code ? 'bg-green text-cream' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {code === 'fr' ? t('lang.fr') : t('lang.ar')}
        </button>
      ))}
    </div>
  )
}
