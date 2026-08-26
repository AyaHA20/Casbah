import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  adminApi,
  type CarrierName,
  type RateList,
  type RateRow,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDA } from '../../lib/format'
import { Ltr, useT } from '../../lib/i18n'
import { FetchError } from '../../components/FetchError'
import { TableSkeleton } from '../../components/Skeleton'
import { Chip, FIELD, FilterSummary, normalize } from '../../components/admin/filters'

const CARRIERS: CarrierName[] = ['YALIDINE', 'ZR_EXPRESS', 'OTHER']
const CARRIER_LABEL: Record<CarrierName, string> = {
  YALIDINE: 'Yalidine',
  ZR_EXPRESS: 'ZR Express',
  OTHER: 'Autre',
}

export function AdminLivraison() {
  const { t, lang } = useT()
  const { token, signOut } = useAuth()

  const [carrier, setCarrier] = useState<CarrierName>('OTHER')
  const [payload, setPayload] = useState<RateList | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkDesk, setBulkDesk] = useState('')
  const [bulkHome, setBulkHome] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const guard = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') signOut()
      setError(e)
    },
    [signOut],
  )

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setError(null)
      setLoading(true)
      setPayload(await adminApi.listRates(token, carrier))
    } catch (e) {
      guard(e)
    } finally {
      setLoading(false)
    }
  }, [token, carrier, guard, reloadKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Switching carrier shows a different price list, so a selection made against
  // the previous one no longer means anything.
  useEffect(() => {
    setSelected(new Set())
  }, [carrier])

  const rows = useMemo(() => {
    const all = payload?.data ?? []
    const needle = normalize(q)
    if (!needle) return all
    // Search matches either script: the owner may type "Setif" or "سطيف".
    return all.filter(
      (r) =>
        normalize(r.nameFr).includes(needle) ||
        r.nameAr.includes(q.trim()) ||
        String(r.code) === needle,
    )
  }, [payload, q])

  async function saveOne(row: RateRow, deskPrice: number, homePrice: number) {
    if (!token) return
    try {
      setNotice(null)
      setPayload(
        await adminApi.saveRates(token, carrier, [
          { wilayaCode: row.code, deskPrice, homePrice },
        ]),
      )
    } catch (e) {
      guard(e)
    }
  }

  async function applyBulk() {
    if (!token || selected.size === 0) return
    const desk = bulkDesk === '' ? null : Number(bulkDesk)
    const home = bulkHome === '' ? null : Number(bulkHome)
    if (desk === null && home === null) return

    setBusy(true)
    try {
      setNotice(null)
      // Unset fields keep each wilaya's existing price rather than zeroing it.
      const rates = [...selected].map((code) => {
        const row = (payload?.data ?? []).find((r) => r.code === code)
        return {
          wilayaCode: code,
          deskPrice: desk ?? row?.rate?.deskPrice ?? 0,
          homePrice: home ?? row?.rate?.homePrice ?? 0,
        }
      })
      setPayload(await adminApi.saveRates(token, carrier, rates))
      setNotice(t('shippingAdmin.bulkDone'))
      setBulkDesk('')
      setBulkHome('')
    } catch (e) {
      guard(e)
    } finally {
      setBusy(false)
    }
  }

  async function makeDefault(codes: number[]) {
    if (!token || codes.length === 0) return
    setBusy(true)
    try {
      setNotice(null)
      setPayload(await adminApi.setDefaultCarrier(token, carrier, codes))
      setNotice(t('shippingAdmin.defaultDone'))
    } catch (e) {
      guard(e)
    } finally {
      setBusy(false)
    }
  }

  function toggle(code: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.code))
  const missingRate = rows.filter((r) => r.rate === null).length

  return (
    <div className="col-span-full flex flex-col gap-6 px-gutter py-7 lg:px-10 lg:pb-14 lg:pt-9">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-[32px] lg:text-[42px]">{t('admin.shipping')}</h1>
        <div className="flex gap-8">
          <Stat value={String(payload?.data.length ?? '—')} label={t('shippingAdmin.wilayas')} />
          <Stat
            value={String(payload?.data.filter((r) => r.isDefault).length ?? '—')}
            label={t('shippingAdmin.usedAtCheckout')}
          />
        </div>
      </div>

      {/* The rates in the database are generated bands, not courier tariffs.
          Saying so on the screen is the point of this page existing. */}
      <p className="rounded-md border border-rust/40 bg-rust/5 p-3.5 text-meta text-rust">
        {t('shippingAdmin.placeholderWarning')}
      </p>

      {/* ---- Carrier ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label font-semibold uppercase text-ink-soft">
          {t('shippingAdmin.carrier')}
        </span>
        {CARRIERS.map((c) => (
          <Chip key={c} active={carrier === c} onClick={() => setCarrier(c)}>
            {CARRIER_LABEL[c]}
          </Chip>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('shippingAdmin.search')}
          className={`${FIELD} lg:w-[260px]`}
        />
      </div>

      {missingRate > 0 && (
        <p className="rounded-md border border-line bg-field p-3 text-meta text-ink-soft">
          {t('shippingAdmin.noRateYet')} {CARRIER_LABEL[carrier]} — {missingRate}{' '}
          {t('shippingAdmin.wilayas')}.
        </p>
      )}

      {/* ---- Bulk ---- */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-line p-3.5">
        <span className="text-label font-semibold uppercase text-ink-soft">
          {t('shippingAdmin.bulk')} · {selected.size}
        </span>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">{t('shippingAdmin.desk')}</span>
          <input
            inputMode="numeric"
            value={bulkDesk}
            onChange={(e) => setBulkDesk(e.target.value.replace(/\D/g, ''))}
            className={`${FIELD} w-[110px]`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">{t('shippingAdmin.home')}</span>
          <input
            inputMode="numeric"
            value={bulkHome}
            onChange={(e) => setBulkHome(e.target.value.replace(/\D/g, ''))}
            className={`${FIELD} w-[110px]`}
          />
        </label>
        <button
          type="button"
          disabled={busy || selected.size === 0 || (!bulkDesk && !bulkHome)}
          onClick={() => void applyBulk()}
          className="min-h-11 rounded-pill border border-green bg-green px-5 text-meta font-semibold text-cream disabled:border-line disabled:bg-line disabled:text-white"
        >
          {t('shippingAdmin.applyToSelected')}
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void makeDefault([...selected])}
          className="min-h-11 rounded-pill border border-green px-5 text-meta font-semibold text-green disabled:border-line disabled:text-line"
        >
          {t('shippingAdmin.useForCheckout')}
        </button>
      </div>

      {notice && (
        <p className="rounded-md border border-green/40 bg-green/5 p-3 text-meta text-green">{notice}</p>
      )}

      {error !== null && <FetchError error={error} onRetry={() => setReloadKey((k) => k + 1)} />}

      <FilterSummary
        count={rows.length}
        noun={[t('shippingAdmin.wilaya'), t('shippingAdmin.wilayas')]}
        active={Boolean(q || selected.size)}
        onReset={() => {
          setQ('')
          setSelected(new Set())
        }}
      />

      {loading && error === null && (
        <TableSkeleton rows={8} cols="lg:grid-cols-[40px_60px_1.6fr_120px_120px_140px]" />
      )}

      {!loading && error === null && (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[40px_60px_1.6fr_120px_120px_140px] gap-4 border-b border-ink py-3 text-label font-semibold uppercase text-ink-soft lg:grid">
            <input
              type="checkbox"
              checked={allShownSelected}
              aria-label={t('shippingAdmin.selectAll')}
              onChange={() =>
                setSelected(allShownSelected ? new Set() : new Set(rows.map((r) => r.code)))
              }
              className="h-5 w-5"
            />
            <span>{t('shippingAdmin.code')}</span>
            <span>{t('shippingAdmin.wilaya')}</span>
            <span>{t('shippingAdmin.desk')}</span>
            <span>{t('shippingAdmin.home')}</span>
            <span>{t('shippingAdmin.checkout')}</span>
          </div>

          {rows.map((r) => (
            <div
              key={r.code}
              className="grid grid-cols-[28px_1fr] items-center gap-3 border-b border-line py-3 lg:grid-cols-[40px_60px_1.6fr_120px_120px_140px] lg:gap-4"
            >
              <input
                type="checkbox"
                checked={selected.has(r.code)}
                onChange={() => toggle(r.code)}
                aria-label={`${r.code} ${r.nameFr}`}
                className="h-5 w-5"
              />
              <span className="hidden text-sm text-ink-soft lg:inline">
                <Ltr>{String(r.code)}</Ltr>
              </span>
              <span className="text-sm font-semibold">
                {lang === 'ar' ? r.nameAr : r.nameFr}
                <span className="block text-xs font-normal text-ink-soft lg:hidden">
                  {r.code} · {r.rate ? `${fmtDA(r.rate.deskPrice, lang)} / ${fmtDA(r.rate.homePrice, lang)}` : '—'}
                </span>
              </span>

              <PriceInput
                value={r.rate?.deskPrice ?? null}
                onCommit={(v) => void saveOne(r, v, r.rate?.homePrice ?? 0)}
                label={`${t('shippingAdmin.desk')} ${r.nameFr}`}
              />
              <PriceInput
                value={r.rate?.homePrice ?? null}
                onCommit={(v) => void saveOne(r, r.rate?.deskPrice ?? 0, v)}
                label={`${t('shippingAdmin.home')} ${r.nameFr}`}
              />

              <span className="col-span-2 lg:col-span-1">
                {r.isDefault ? (
                  <span className="text-meta font-semibold text-green">
                    {t('shippingAdmin.inUse')}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy || r.rate === null}
                    onClick={() => void makeDefault([r.code])}
                    className="min-h-11 text-meta text-ink-soft hover:text-green disabled:text-line"
                    title={r.defaultCarrier ? `${t('shippingAdmin.currently')} ${CARRIER_LABEL[r.defaultCarrier]}` : ''}
                  >
                    {r.defaultCarrier && r.defaultCarrier !== carrier
                      ? CARRIER_LABEL[r.defaultCarrier]
                      : t('shippingAdmin.use')}
                  </button>
                )}
              </span>
            </div>
          ))}

          {rows.length === 0 && (
            <p className="py-10 text-center text-ink-soft">{t('shippingAdmin.noMatch')}</p>
          )}
        </div>
      )}

      <p className="text-meta text-ink-soft">{t('shippingAdmin.savesOnBlur')}</p>
    </div>
  )
}

/** Inline price cell — commits on blur, same pattern as the stock editor. */
function PriceInput({
  value,
  onCommit,
  label,
}: {
  value: number | null
  onCommit: (v: number) => void
  label: string
}) {
  return (
    <input
      type="number"
      min={0}
      defaultValue={value ?? ''}
      key={`${label}-${value ?? 'none'}`}
      aria-label={label}
      placeholder="—"
      onBlur={(e) => {
        const next = Number(e.target.value)
        if (e.target.value !== '' && next !== value) onCommit(next)
      }}
      className={`min-h-11 w-[100px] rounded-sm border bg-field px-2 text-end text-sm outline-none focus:border-green ${
        value === null ? 'border-line text-ink-soft' : 'border-line'
      }`}
    />
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[22px] font-bold leading-none">{value}</span>
      <span className="text-meta text-ink-soft">{label}</span>
    </div>
  )
}
