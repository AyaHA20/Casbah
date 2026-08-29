import { useState } from 'react'
import { adminApi, type AdminCategory, type AdminProductType } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { FIELD } from './filters'
import { TaxonomyPanel } from './TaxonomyPanel'

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

/** Rayons — the shop sections. Rename, add Arabic, delete when empty. */
export function RayonsPanel({
  categories,
  onChanged,
}: {
  categories: AdminCategory[]
  onChanged: () => Promise<void>
}) {
  const { t } = useT()
  const { token } = useAuth()

  return (
    <TaxonomyPanel
      items={categories}
      title={t('categories.title')}
      help={t('categories.help')}
      inUse={t('categories.inUse')}
      empty={t('categories.empty')}
      onSave={(id, body) => adminApi.updateCategory(token!, id, body)}
      onDelete={(id) => adminApi.deleteCategory(token!, id)}
      onChanged={onChanged}
    />
  )
}

/**
 * Types — what the garment IS.
 *
 * Same panel as Rayons. Until this existed, ProductType.nameAr had no write
 * path at all, so every type chip on the storefront fell back to French no
 * matter what the endpoints returned.
 */
export function TypesPanel({
  types,
  onChanged,
}: {
  types: AdminProductType[]
  onChanged: () => Promise<void>
}) {
  const { t } = useT()
  const { token } = useAuth()

  return (
    <TaxonomyPanel
      items={types}
      title={t('types.title')}
      help={t('types.help')}
      inUse={t('types.inUse')}
      empty={t('types.empty')}
      onSave={(id, body) => adminApi.updateProductType(token!, id, body)}
      onDelete={(id) => adminApi.deleteProductType(token!, id)}
      onChanged={onChanged}
    />
  )
}
