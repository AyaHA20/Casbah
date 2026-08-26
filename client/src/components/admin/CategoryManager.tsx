import { useState } from 'react'
import { ApiError, adminApi, type AdminCategory } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { FIELD } from './filters'

const LABEL = 'text-meta text-ink-soft'

/**
 * Shop sections — Nouveautés, Soldes, Collection été.
 *
 * They stopped being Femme/Homme deliberately: who a garment is for lives on
 * Product.gender and nowhere else, and having both fields answer that question
 * is how they started contradicting each other. Nothing here offers a gender.
 */

export function CategoryPicker({
  categories,
  value,
  onChange,
  onCategoriesChanged,
  onError,
}: {
  categories: AdminCategory[]
  value: number | null
  onChange: (id: number | null) => void
  onCategoriesChanged: () => Promise<void>
  onError: (e: unknown) => void
}) {
  const { t } = useT()
  const { token } = useAuth()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!token || name.trim().length < 2) return
    setBusy(true)
    try {
      const made = await adminApi.createCategory(token, { name: name.trim() })
      await onCategoriesChanged()
      onChange(made.id) // select what was just made, as the type picker does
      setName('')
      setAdding(false)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL}>{t('categories.label')}</span>
      {adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('ph.categoryExample')}
            className={`${FIELD} flex-1`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void create()
              }
            }}
          />
          <button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={() => void create()}
            className="min-h-11 rounded-pill border border-green bg-green px-4 py-2 text-meta font-semibold text-cream disabled:border-line disabled:bg-line disabled:text-white"
          >
            {busy ? '…' : t('products.create')}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setName('')
            }}
            className="text-meta text-ink-soft hover:text-ink"
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            className={`${FIELD} flex-1 appearance-none`}
          >
            <option value="">{t('categories.none')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-11 whitespace-nowrap rounded-pill border border-green px-3 py-2 text-meta font-semibold text-green"
          >
            {t('categories.new')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Rename and delete. Deleting is refused server-side while products are still
 * filed under the section — Product.categoryId is SetNull, so the delete would
 * otherwise succeed and quietly uncategorise them. The count is shown up front
 * so the refusal is visible before anyone clicks, not only afterwards.
 */
export function RayonsPanel({
  categories,
  onChanged,
}: {
  categories: AdminCategory[]
  onChanged: () => Promise<void>
}) {
  const { t } = useT()
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function edit(c: AdminCategory) {
    setEditId(c.id)
    setName(c.name)
    setNameAr(c.nameAr ?? '')
    setErr(null)
  }

  async function save(c: AdminCategory) {
    if (!token) return
    setBusy(true)
    setErr(null)
    try {
      // Only what changed — an untouched Arabic name is never rewritten to ''.
      await adminApi.updateCategory(token, c.id, {
        ...(name.trim() !== c.name ? { name: name.trim() } : {}),
        ...(nameAr.trim() !== (c.nameAr ?? '') ? { nameAr: nameAr.trim() || null } : {}),
      })
      setEditId(null)
      await onChanged()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(c: AdminCategory) {
    if (!token) return
    setBusy(true)
    setErr(null)
    try {
      await adminApi.deleteCategory(token, c.id)
      await onChanged()
    } catch (e) {
      // CATEGORY_IN_USE arrives with a French sentence naming the count — it is
      // more useful than anything this component could compose.
      setErr(e instanceof ApiError ? e.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-start"
      >
        <span className="text-sm font-semibold">
          {t('categories.title')}{' '}
          <span className="font-normal text-ink-soft">({categories.length})</span>
        </span>
        <span aria-hidden className="text-ink-soft">
          {open ? '–' : '+'}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-line p-4">
          <p className="text-meta text-ink-soft">{t('categories.help')}</p>

          {err && (
            <p className="rounded-md border border-rust/40 bg-rust/5 p-2 text-meta text-rust">
              {err}
            </p>
          )}

          {categories.map((c) =>
            editId === c.id ? (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${FIELD} flex-1`}
                />
                <input
                  dir="rtl"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder={t('categories.nameAr')}
                  className={`${FIELD} flex-1`}
                />
                <button
                  type="button"
                  disabled={busy || name.trim().length < 2}
                  onClick={() => void save(c)}
                  className="min-h-11 rounded-pill border border-green bg-green px-4 text-meta font-semibold text-cream disabled:border-line disabled:bg-line disabled:text-white"
                >
                  {busy ? '…' : t('products.save')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditId(null)}
                  className="min-h-11 px-2 text-meta text-ink-soft hover:text-ink"
                >
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {c.name}
                    {c.nameAr && (
                      <span className="ps-2 text-ink-soft" dir="rtl">
                        {c.nameAr}
                      </span>
                    )}
                  </span>
                  <span className="text-meta text-ink-soft">
                    {c.slug} · {c._count.products} {t('categories.products')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => edit(c)}
                    className="min-h-11 rounded-pill border border-line px-3 text-meta font-semibold text-ink hover:border-green hover:text-green"
                  >
                    {t('categories.edit')}
                  </button>
                  {/* Disabled rather than hidden: the count next to it explains
                      why, and a button that vanishes reads as a missing feature. */}
                  <button
                    type="button"
                    disabled={busy || c._count.products > 0}
                    title={c._count.products > 0 ? t('categories.inUse') : ''}
                    onClick={() => void remove(c)}
                    className="min-h-11 rounded-pill border border-line px-3 text-meta font-semibold text-rust hover:border-rust disabled:text-line disabled:hover:border-line"
                  >
                    {t('products.delete')}
                  </button>
                </div>
              </div>
            ),
          )}

          {categories.length === 0 && (
            <p className="py-2 text-meta text-ink-soft">{t('categories.empty')}</p>
          )}
        </div>
      )}
    </section>
  )
}
