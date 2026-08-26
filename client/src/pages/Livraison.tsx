import { useEffect, useMemo, useState } from 'react'
import { api, type Wilaya } from '../lib/api'
import { useT } from '../lib/i18n'
import { FetchError } from '../components/FetchError'
import { Bar } from '../components/Skeleton'
import { fmtDA } from '../lib/format'

export function Livraison() {
  const { t, lang } = useT()
  const [wilayas, setWilayas] = useState<Wilaya[]>([])
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .listWilayas()
      .then(setWilayas)
      .catch((e: unknown) => setError(e))
      .finally(() => setLoading(false))
  }, [reloadKey])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return wilayas
    return wilayas.filter(
      (w) => w.nameFr.toLowerCase().includes(q) || String(w.code) === q || w.nameAr.includes(query),
    )
  }, [wilayas, query])

  return (
    <>
      <section className="mx-auto max-w-shell px-gutter pb-8 pt-7 lg:px-gutter-lg lg:py-section">
        <span className="wordmark text-meta text-green lg:text-[15px]">{t('shipping.title')}</span>
        <h1 className="mt-4 text-h1 lg:text-display">
          {t('shipping.deliveredIn')} <span className="text-green">{t('shipping.wilayasWord')}</span>
        </h1>
        <p className="mt-5 max-w-measure text-body lg:text-lead">
          {t('shipping.intro')}
        </p>

        <dl className="mt-8 grid gap-4 border-t border-line pt-6 lg:grid-cols-3 lg:gap-8">
          {[
            [t('shipping.desk'), t('shipping.deskBody')],
            [t('shipping.home'), t('shipping.homeBody')],
            [t('shipping.delay'), t('shipping.delayBody')],
          ].map(([term, desc]) => (
            <div key={term} className="flex flex-col gap-2">
              <dt className="font-display text-h3 uppercase text-green">{term}</dt>
              <dd className="text-body text-ink-soft">{desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Tarifs — read live from the API, so this page can never drift from
          what checkout actually charges. */}
      <section className="mx-auto max-w-shell px-gutter pb-section lg:px-gutter-lg">
        <div className="flex flex-col gap-4 border-t border-ink pt-6 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="text-h3 lg:text-h2">{t('shipping.title')}</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('stock.search')}
            className="w-full rounded-[12px] border border-line bg-field p-field text-body outline-none focus:border-green lg:w-[320px]"
          />
        </div>

        {error !== null && (
          <div className="mt-6">
            <FetchError error={error} onRetry={() => setReloadKey((k) => k + 1)} />
          </div>
        )}

        {/* Rate-table skeleton: same row rhythm as the real table. */}
        {loading && error === null && (
          <div className="mt-6 flex flex-col gap-3" role="status" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 border-b border-line pb-3">
                <Bar w="w-40" h="h-3.5" />
                <Bar w="w-20" h="h-3.5" />
                <Bar w="w-20" h="h-3.5" />
              </div>
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-start">
              <thead>
                <tr className="border-b border-ink text-label font-semibold uppercase text-ink-soft">
                  <th className="py-3 pe-4 font-semibold">{t('shipping.code')}</th>
                  <th className="py-3 pe-4 font-semibold">{t('shipping.wilaya')}</th>
                  <th className="py-3 pe-4 text-end font-semibold">{t('shipping.desk')}</th>
                  <th className="py-3 text-end font-semibold">{t('shipping.home')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.code} className="border-b border-line">
                    <td className="py-[14px] pe-4 text-meta text-ink-soft">{w.code}</td>
                    <td className="py-[14px] pe-4 text-body font-medium">
                      {lang === 'ar' ? w.nameAr : w.nameFr}
                      <span className="ps-2 text-meta text-ink-soft" lang="ar">
                        {lang === 'ar' ? w.nameFr : w.nameAr}
                      </span>
                    </td>
                    <td className="py-[14px] pe-4 text-end font-display text-[17px] font-bold text-green">
                      {w.deskPrice === null ? '—' : fmtDA(w.deskPrice, lang)}
                    </td>
                    <td className="py-[14px] text-end font-display text-[17px] font-bold">
                      {w.homePrice === null ? '—' : fmtDA(w.homePrice, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {wilayas.length > 0 && filtered.length === 0 && (
          <p className="py-10 text-center text-ink-soft">Aucune wilaya ne correspond à « {query} ».</p>
        )}

        <p className="mt-6 text-meta text-ink-soft">
          {t('shipping.footnote')}
        </p>
      </section>
    </>
  )
}
