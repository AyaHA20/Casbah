import { ApiError } from '../lib/api'
import { useT } from '../lib/i18n'

/**
 * Visible failure state with a way out.
 *
 * Every fetch that a screen depends on gets one of these. Showing raw error
 * text and stopping leaves the customer with nothing to do but reload the page
 * — and the most common failure here is a Neon cold start, which succeeds on
 * the second try, so a retry button usually IS the fix.
 */
export function FetchError({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown
  onRetry: () => void
  compact?: boolean
}) {
  const { t } = useT()

  // A network-level failure means the API is unreachable, which reads very
  // differently from "the server said no" — say which one it is.
  const unreachable = error instanceof ApiError && error.code === 'NETWORK'
  const message = unreachable
    ? t('common.unreachable')
    : error instanceof Error
      ? error.message
      : t('common.loadFailed')

  return (
    <div
      role="alert"
      className={`flex flex-col items-start gap-3 rounded-md border border-rust/40 bg-rust/5 ${
        compact ? 'p-3.5' : 'p-5'
      }`}
    >
      <p className="text-body text-rust">{message}</p>
      {unreachable && <p className="text-meta text-ink-soft">{t('common.coldHint')}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-pill border border-green bg-green px-5 text-sm font-semibold text-cream"
      >
        {t('common.retry')}
      </button>
    </div>
  )
}
