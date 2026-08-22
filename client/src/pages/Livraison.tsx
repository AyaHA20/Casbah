import { useEffect, useMemo, useState } from 'react'
import { api, type Wilaya } from '../lib/api'
import { fmtDA } from '../lib/format'

export function Livraison() {
  const [wilayas, setWilayas] = useState<Wilaya[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    api
      .listWilayas()
      .then(setWilayas)
      .catch((e: Error) => setError(e.message))
  }, [])

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
        <span className="wordmark text-meta text-green lg:text-[15px]">Livraison</span>
        <h1 className="mt-4 text-h1 lg:text-display">
          Livré dans les <span className="text-green">69 wilayas</span>
        </h1>
        <p className="mt-5 max-w-measure text-body lg:text-lead">
          Vous payez en espèces à la réception, jamais avant. Nous vous appelons pour confirmer
          chaque commande avant de l'expédier.
        </p>

        <dl className="mt-8 grid gap-4 border-t border-line pt-6 lg:grid-cols-3 lg:gap-8">
          {[
            ['Stop desk', "Vous retirez le colis au bureau du transporteur. C'est l'option la moins chère."],
            ['À domicile', 'Le livreur vous appelle avant de passer à l’adresse indiquée.'],
            ['Délai', '24 à 72 h après la confirmation téléphonique, selon la wilaya.'],
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
          <h2 className="text-h3 lg:text-h2">Tarifs par wilaya</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une wilaya — Alger, 16…"
            className="w-full rounded-[12px] border border-line bg-field p-field text-body outline-none focus:border-green lg:w-[320px]"
          />
        </div>

        {error && (
          <p className="mt-6 rounded-md border border-rust/40 bg-rust/5 p-4 text-body text-rust">
            {error}
          </p>
        )}

        {!error && wilayas.length === 0 && (
          <p className="py-10 text-center text-ink-soft">Chargement des tarifs…</p>
        )}

        {filtered.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink text-label font-semibold uppercase text-ink-soft">
                  <th className="py-3 pr-4 font-semibold">N°</th>
                  <th className="py-3 pr-4 font-semibold">Wilaya</th>
                  <th className="py-3 pr-4 text-right font-semibold">Stop desk</th>
                  <th className="py-3 text-right font-semibold">À domicile</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.code} className="border-b border-line">
                    <td className="py-[14px] pr-4 text-meta text-ink-soft">{w.code}</td>
                    <td className="py-[14px] pr-4 text-body font-medium">
                      {w.nameFr}
                      <span className="pl-2 text-meta text-ink-soft">{w.nameAr}</span>
                    </td>
                    <td className="py-[14px] pr-4 text-right font-display text-[17px] font-bold text-green">
                      {w.deskPrice === null ? '—' : fmtDA(w.deskPrice)}
                    </td>
                    <td className="py-[14px] text-right font-display text-[17px] font-bold">
                      {w.homePrice === null ? '—' : fmtDA(w.homePrice)}
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
          Tarifs indicatifs, confirmés au moment de la commande. Retour ou échange sous 7 jours,
          article non porté.
        </p>
      </section>
    </>
  )
}
