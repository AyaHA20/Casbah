import { useState } from 'react'
import { ApiError } from '../../lib/api'
import { useT } from '../../lib/i18n'
import { FIELD } from './filters'

/**
 * One panel, two taxonomies.
 *
 * Rayons (Category) and Types (ProductType) are the same shape: a French name,
 * an optional Arabic one, a slug that survives renames, and a delete that must
 * refuse while products still point at it. They are rendered by the same
 * component on purpose — kept as two near-identical copies, they drift, which
 * is exactly how ProductType.nameAr ended up unreachable while Category's
 * worked.
 */
export type TaxonomyItem = {
  id: number
  name: string
  nameAr: string | null
  slug: string
  _count: { products: number }
}

export function TaxonomyPanel({
  items,
  title,
  help,
  inUse,
  empty,
  onSave,
  onDelete,
  onChanged,
}: {
  items: TaxonomyItem[]
  title: string
  help: string
  /** Tooltip on the disabled delete button. */
  inUse: string
  empty: string
  onSave: (id: number, body: { name?: string; nameAr?: string | null }) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
  onChanged: () => Promise<void>
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function edit(it: TaxonomyItem) {
    setEditId(it.id)
    setName(it.name)
    setNameAr(it.nameAr ?? '')
    setErr(null)
  }

  async function save(it: TaxonomyItem) {
    setBusy(true)
    setErr(null)
    try {
      // Only what changed — an untouched Arabic name is never rewritten to ''.
      await onSave(it.id, {
        ...(name.trim() !== it.name ? { name: name.trim() } : {}),
        ...(nameAr.trim() !== (it.nameAr ?? '') ? { nameAr: nameAr.trim() || null } : {}),
      })
      setEditId(null)
      await onChanged()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(it: TaxonomyItem) {
    setBusy(true)
    setErr(null)
    try {
      await onDelete(it.id)
      await onChanged()
    } catch (e) {
      // CATEGORY_IN_USE / TYPE_IN_USE arrive with a French sentence naming the
      // count — more useful than anything this component could compose.
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
          {title} <span className="font-normal text-ink-soft">({items.length})</span>
        </span>
        <span aria-hidden className="text-ink-soft">
          {open ? '–' : '+'}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-line p-4">
          <p className="text-meta text-ink-soft">{help}</p>

          {err && (
            <p className="rounded-md border border-rust/40 bg-rust/5 p-2 text-meta text-rust">
              {err}
            </p>
          )}

          {items.map((it) =>
            editId === it.id ? (
              <div key={it.id} className="flex flex-wrap items-center gap-2">
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
                  onClick={() => void save(it)}
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
                key={it.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {it.name}
                    {it.nameAr && (
                      <span className="ps-2 text-ink-soft" dir="rtl">
                        {it.nameAr}
                      </span>
                    )}
                  </span>
                  <span className="text-meta text-ink-soft">
                    {it.slug} · {it._count.products} {t('categories.products')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => edit(it)}
                    className="min-h-11 rounded-pill border border-line px-3 text-meta font-semibold text-ink hover:border-green hover:text-green"
                  >
                    {t('categories.edit')}
                  </button>
                  {/* Disabled rather than hidden: the count next to it explains
                      why, and a button that vanishes reads as a missing feature. */}
                  <button
                    type="button"
                    disabled={busy || it._count.products > 0}
                    title={it._count.products > 0 ? inUse : ''}
                    onClick={() => void remove(it)}
                    className="min-h-11 rounded-pill border border-line px-3 text-meta font-semibold text-rust hover:border-rust disabled:text-line disabled:hover:border-line"
                  >
                    {t('products.delete')}
                  </button>
                </div>
              </div>
            ),
          )}

          {items.length === 0 && <p className="py-2 text-meta text-ink-soft">{empty}</p>}
        </div>
      )}
    </section>
  )
}
