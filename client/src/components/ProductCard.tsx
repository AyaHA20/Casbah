import { Link } from 'react-router-dom'
import type { ProductListItem } from '../lib/api'
import { useT } from '../lib/i18n'
import { fmtDA } from '../lib/format'

export function ProductCard({ product }: { product: ProductListItem }) {
  const { t, lang } = useT()
  const image = product.images[0]

  return (
    <Link to={`/p/${product.slug}`} className="group flex flex-col gap-[10px] text-ink">
      {/* The arch is reserved for photos. Top corners only, bottom at 3px. */}
      <div className="relative h-[210px] overflow-hidden rounded-arch border border-cream-edge bg-glow lg:h-[300px] lg:rounded-arch-md">
        {image ? (
          <img src={image} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-x-0 bottom-4 text-center text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            {t('product.comingPhoto')}
          </span>
        )}
        {!product.inStock && (
          <span className="absolute start-3 top-3 rounded-pill bg-ink/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream">
            {t('product.soldOut')}
          </span>
        )}
      </div>

      <div>
        <div className="text-sm font-semibold leading-[1.3] group-hover:text-green">{product.name}</div>
        <div className="pt-0.5 text-xs text-ink-soft">{product.category?.name ?? t('products.noCategory')}</div>
        <div className="pt-[5px] font-display text-[17px] font-bold text-green lg:text-[20px]">
          {fmtDA(product.basePrice, lang)}
        </div>
      </div>
    </Link>
  )
}
