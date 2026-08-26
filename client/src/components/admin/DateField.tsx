import { useEffect, useState } from 'react'
import { useT } from '../../lib/i18n'

/**
 * A date field that shows the format the shop actually uses.
 *
 * `<input type="date">` renders its display format from the BROWSER locale, not
 * the page — it ignores `lang` and CSS cannot reach it. On an en-US machine it
 * reads mm/dd/yyyy no matter what language the admin is in, which is ambiguous
 * for exactly the dates that matter (01/08 vs 08/01).
 *
 * So this is a plain text field that parses and prints jj/mm/aaaa, while the
 * value it reports stays the ISO `YYYY-MM-DD` the API expects. The trade is the
 * loss of the native mobile picker; the admin is desktop-heavy and an
 * unambiguous date is worth more than a wheel.
 */

/** "2026-08-19" -> "19/08/2026" */
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** "19/08/2026" (or "19-8-26", "19 08 2026") -> "2026-08-19", or null. */
export function displayToIso(input: string): string | null {
  const parts = input.trim().split(/[/\-. ]+/).filter(Boolean)
  if (parts.length !== 3) return null
  const [d, mo, y] = parts.map((p) => Number(p))
  if (!Number.isInteger(d) || !Number.isInteger(mo) || !Number.isInteger(y)) return null
  const year = y < 100 ? 2000 + y : y
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || year < 1900 || year > 2999) return null
  // Reject impossible days (31 February) by round-tripping through Date.
  const probe = new Date(Date.UTC(year, mo - 1, d))
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(mo)}-${pad(d)}`
}

export function DateField({
  value,
  onChange,
  className = '',
  ariaLabel,
}: {
  /** ISO `YYYY-MM-DD`, or '' for empty. */
  value: string
  onChange: (iso: string) => void
  className?: string
  ariaLabel?: string
}) {
  const { t } = useT()
  const [text, setText] = useState(() => isoToDisplay(value))
  const [invalid, setInvalid] = useState(false)

  // Follow the value when it changes from outside (reset, load, language swap).
  useEffect(() => {
    setText(isoToDisplay(value))
    setInvalid(false)
  }, [value])

  function commit(raw: string) {
    if (raw.trim() === '') {
      setInvalid(false)
      onChange('')
      return
    }
    const iso = displayToIso(raw)
    if (iso === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setText(isoToDisplay(iso))
    onChange(iso)
  }

  return (
    <span className="flex flex-col gap-1">
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        autoComplete="off"
        value={text}
        placeholder={t('date.placeholder')}
        aria-label={ariaLabel ?? t('date.placeholder')}
        aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value)
          if (invalid) setInvalid(false)
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
        }}
        className={`min-h-11 rounded-[12px] border bg-field px-[14px] text-sm outline-none focus:border-green ${
          invalid ? 'border-rust text-rust' : 'border-line'
        } ${className}`}
      />
      {invalid && <span className="text-xs text-rust">{t('date.invalid')}</span>}
    </span>
  )
}
