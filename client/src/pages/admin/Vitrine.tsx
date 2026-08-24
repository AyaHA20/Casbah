import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  adminApi,
  describeError,
  uploadToSignedUrl,
  type AdminProduct,
  type StorefrontSettings,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { renderHeroHeading } from '../../lib/hero-markup'
import { FIELD } from '../../components/admin/filters'
import { fmtDA } from '../../lib/format'

const LABEL = 'text-meta text-ink-soft'

export function AdminVitrine() {
  const { t, lang } = useT()
  const { token, signOut } = useAuth()

  const [settings, setSettings] = useState<StorefrontSettings | null>(null)
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [storageOn, setStorageOn] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const guard = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') signOut()
      setError(describeError(e))
    },
    [signOut],
  )

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setError(null)
      const [s, p] = await Promise.all([
        adminApi.getSettings(token),
        adminApi.listProducts(token, { limit: 100 }),
      ])
      setSettings(s)
      setProducts(p.data)
    } catch (e) {
      guard(e)
    }
  }, [token, guard])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!token) return
    adminApi
      .storageStatus(token)
      .then((s) => setStorageOn(s.configured))
      .catch(() => setStorageOn(false))
  }, [token])

  function set<K extends keyof StorefrontSettings>(key: K, value: StorefrontSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  async function save() {
    if (!token || !settings) return
    setBusy(true)
    try {
      setSettings(await adminApi.saveSettings(token, settings))
      setSaved(true)
    } catch (e) {
      guard(e)
    } finally {
      setBusy(false)
    }
  }

  async function uploadHero(file: File) {
    if (!token) return
    setBusy(true)
    try {
      // Same three-step flow as product photos, but scoped to the storefront
      // folder because the hero belongs to no product.
      const signed = await adminApi.signStorefrontUpload(token, file.name)
      await uploadToSignedUrl(signed.signedUrl, file)
      const saved = await adminApi.saveSettings(token, { heroImage: signed.path })
      setSettings(saved)
    } catch (e) {
      guard(e)
    } finally {
      setBusy(false)
    }
  }

  if (!settings) {
    return (
      <div className="col-span-full px-gutter py-10 lg:px-10">
        <p className="text-ink-soft">{error ?? t('common.loading')}</p>
      </div>
    )
  }

  const featured = settings.featuredProductIds
  const available = products.filter((p) => !featured.includes(p.id))

  function move(id: number, delta: number) {
    const i = featured.indexOf(id)
    const j = i + delta
    if (i === -1 || j < 0 || j >= featured.length) return
    const next = [...featured]
    const [row] = next.splice(i, 1)
    next.splice(j, 0, row!)
    set('featuredProductIds', next)
  }

  return (
    <div className="col-span-full flex flex-col gap-8 px-gutter py-7 lg:px-10 lg:pb-14 lg:pt-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[32px] lg:text-[42px]">{t('vitrine.title')}</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-meta text-green">{t('vitrine.saved')}</span>}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="rounded-pill border border-green bg-green px-6 py-3 text-sm font-semibold text-cream disabled:border-line disabled:bg-line disabled:text-white"
          >
            {busy ? t('products.saving') : t('products.save')}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-rust/40 bg-rust/5 p-4 text-body text-rust">{error}</p>
      )}

      {/* ---------------- Hero ---------------- */}
      <section className="flex flex-col gap-5 border-t border-line pt-6">
        <h2 className="text-h3">{t('vitrine.heroSection')}</h2>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex flex-col gap-2">
            <span className={LABEL}>{t('vitrine.heroImage')}</span>
            {settings.heroImage ? (
              <img
                src={settings.heroImage}
                alt=""
                className="h-[150px] w-[110px] rounded-arch border border-cream-edge bg-glow object-cover"
              />
            ) : (
              <div className="grid h-[150px] w-[110px] place-items-center rounded-arch border border-cream-edge bg-glow text-center text-xs text-ink-soft">
                {t('product.comingPhoto')}
              </div>
            )}
            <label
              className={`cursor-pointer text-center text-meta ${storageOn ? 'text-green' : 'cursor-not-allowed text-line'}`}
            >
              {t('products.addPhoto')}
              <input
                type="file"
                accept="image/*"
                disabled={!storageOn || busy}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadHero(f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          <div className="grid flex-1 gap-5 lg:grid-cols-2">
            <LangColumn
              title={t('vitrine.french')}
              dir="ltr"
              heading={settings.heroHeadingFr}
              body={settings.heroBodyFr}
              cta={settings.heroCtaFr}
              onHeading={(v) => set('heroHeadingFr', v)}
              onBody={(v) => set('heroBodyFr', v)}
              onCta={(v) => set('heroCtaFr', v)}
            />
            <LangColumn
              title={t('vitrine.arabic')}
              dir="rtl"
              heading={settings.heroHeadingAr}
              body={settings.heroBodyAr}
              cta={settings.heroCtaAr}
              onHeading={(v) => set('heroHeadingAr', v)}
              onBody={(v) => set('heroBodyAr', v)}
              onCta={(v) => set('heroCtaAr', v)}
            />
          </div>
        </div>

        <p className="text-meta text-ink-soft">{t('vitrine.markupHint')}</p>

        {/* Live preview of the accent markup, so the convention is obvious. */}
        {(settings.heroHeadingFr || settings.heroHeadingAr) && (
          <div className="rounded-md border border-line bg-cream/40 p-4">
            <h3 className="font-display text-[28px] font-bold uppercase leading-none">
              {renderHeroHeading(lang === 'ar' ? settings.heroHeadingAr : settings.heroHeadingFr)}
            </h3>
          </div>
        )}
      </section>

      {/* ---------------- Featured ---------------- */}
      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <h2 className="text-h3">{t('vitrine.featured')}</h2>
        <p className="text-meta text-ink-soft">{t('vitrine.featuredHint')}</p>

        <div className="flex flex-col">
          {featured.map((id, i) => {
            const p = products.find((x) => x.id === id)
            return (
              <div
                key={id}
                className="flex flex-wrap items-center gap-3 border-b border-line py-2.5"
              >
                <span className="w-6 text-meta text-ink-soft">{i + 1}.</span>
                <span className="flex-1 text-sm font-semibold">
                  {p ? p.name : `#${id}`}
                  {p && !p.active && (
                    <span className="ms-2 text-xs text-ink-soft">{t('stock.retired')}</span>
                  )}
                </span>
                {p && <span className="text-meta text-ink-soft">{fmtDA(p.basePrice, lang)}</span>}
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  className="text-meta text-ink-soft hover:text-green"
                >
                  {t('vitrine.moveUp')}
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  className="text-meta text-ink-soft hover:text-green"
                >
                  {t('vitrine.moveDown')}
                </button>
                <button
                  type="button"
                  onClick={() => set('featuredProductIds', featured.filter((x) => x !== id))}
                  className="text-meta text-ink-soft hover:text-rust"
                >
                  {t('vitrine.remove')}
                </button>
              </div>
            )
          })}
          {featured.length === 0 && (
            <p className="py-4 text-meta text-ink-soft">{t('vitrine.usingDefaults')}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) set('featuredProductIds', [...featured, Number(e.target.value)])
            }}
            className={`${FIELD} appearance-none lg:w-[320px]`}
          >
            <option value="">{t('vitrine.add')}…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {!p.active ? ` ${t('stock.retired')}` : ''}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ---------------- QR ---------------- */}
      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="text-h3">{t('vitrine.qrSection')}</h2>
        <label className="flex max-w-[520px] flex-col gap-1.5">
          <span className={LABEL}>{t('vitrine.qrUrl')}</span>
          <input
            dir="ltr"
            value={settings.qrUrl}
            onChange={(e) => set('qrUrl', e.target.value)}
            placeholder="https://"
            className={FIELD}
          />
        </label>
        <p className="text-meta text-ink-soft">{t('vitrine.qrHint')}</p>
      </section>
    </div>
  )
}

function LangColumn({
  title,
  dir,
  heading,
  body,
  cta,
  onHeading,
  onBody,
  onCta,
}: {
  title: string
  dir: 'ltr' | 'rtl'
  heading: string
  body: string
  cta: string
  onHeading: (v: string) => void
  onBody: (v: string) => void
  onCta: (v: string) => void
}) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-3">
      <span className="text-label font-semibold uppercase text-ink-soft">{title}</span>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>{t('vitrine.heading')}</span>
        {/* dir is pinned per column so the Arabic field types right-to-left even
            while the admin is in French, and vice versa. */}
        <input dir={dir} value={heading} onChange={(e) => onHeading(e.target.value)} className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>{t('vitrine.body')}</span>
        <textarea
          dir={dir}
          value={body}
          onChange={(e) => onBody(e.target.value)}
          className={`${FIELD} min-h-[90px] resize-y`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>{t('vitrine.cta')}</span>
        <input dir={dir} value={cta} onChange={(e) => onCta(e.target.value)} className={FIELD} />
      </label>
    </div>
  )
}
