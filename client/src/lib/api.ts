/**
 * Where the API lives. Configurable per deployment via VITE_API_URL.
 *
 * Accepts either form — with or without the /api suffix — because both are
 * natural things to paste into an env file, and getting it wrong 404s every
 * request with no clue why. The server mounts its router at /api, so that
 * segment is appended when it is missing rather than assumed.
 *
 * VITE_ vars are inlined into the public bundle at build time: never put a
 * secret here.
 */
function resolveApiBase(): string {
  const raw = import.meta.env.VITE_API_URL?.trim() || 'http://localhost:4000'
  const trimmed = raw.replace(/\/+$/, '')
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`
}

const BASE = resolveApiBase()

export type Category = { name: string; nameAr: string | null; slug: string }
/** What the garment IS — orthogonal to Category. A robe is femme AND robe. */
export type ProductTypeRef = { name: string; nameAr: string | null; slug: string }
export type AdminProductType = {
  id: number
  name: string
  nameAr: string | null
  slug: string
  /** Always returned: both list and create select it. The delete guard reads it. */
  _count: { products: number }
}
/**
 * A shop section — Nouveautés, Soldes, Collection été. Never a gender.
 *
 * `_count.products` is what the delete button reads: the server refuses to
 * delete a section that still holds products, so the count is shown before
 * anyone clicks rather than as an error afterwards.
 */
export type AdminCategory = {
  id: number
  name: string
  nameAr: string | null
  slug: string
  _count: { products: number }
}
export type StorefrontFilters = {
  categories: Category[]
  types: ProductTypeRef[]
  colors: string[]
}

/** Who the garment is cut for. UNISEXE shows under both Femme and Homme. */
export type Gender = 'FEMME' | 'HOMME' | 'UNISEXE'

export type ProductListItem = {
  id: number
  name: string
  nameAr: string | null
  slug: string
  basePrice: number
  images: string[]
  gender: Gender | null
  /** Null for an uncategorised product — Product.categoryId is nullable. */
  category: Category | null
  type: ProductTypeRef | null
  inStock: boolean
}

export type Pagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}

export type Variant = {
  id: number
  size: string
  color: string
  stock: number
  sku: string
  priceOverride: number | null
  price: number
  available: boolean
}

export type Product = {
  id: number
  name: string
  nameAr: string | null
  slug: string
  description: string
  descriptionAr: string | null
  basePrice: number
  images: string[]
  gender: Gender | null
  createdAt: string
  /** Null for an uncategorised product — Product.categoryId is nullable. */
  category: Category | null
  type: ProductTypeRef | null
  /** Per-colour photo sets; absent on older responses. */
  galleries?: ColourGallery[]
  variants: Variant[]
}

export type Wilaya = {
  code: number
  nameFr: string
  nameAr: string
  deskPrice: number | null
  homePrice: number | null
  carrier: string | null
}

export type Commune = { id: number; name: string; nameAr: string | null }

/** Photos for one colour. `color: null` is the shared fallback set. */
export type ColourGallery = {
  color: string | null
  images: Array<{ id: number; url: string; position: number }>
}

/**
 * Which photos to show for a colour.
 *
 * Same fallback chain as the server: the colour's own set, then the shared
 * set, then the legacy flat Product.images. Kept in one function so the two
 * sides cannot drift.
 */
export function resolveGallery(
  galleries: ColourGallery[] | undefined,
  legacyImages: string[],
  color: string | null,
): string[] {
  const g = galleries ?? []
  const own = color === null ? [] : (g.find((x) => x.color === color)?.images ?? [])
  if (own.length > 0) return own.map((i) => i.url)
  const shared = g.find((x) => x.color === null)?.images ?? []
  if (shared.length > 0) return shared.map((i) => i.url)
  return legacyImages
}

export type CreatedOrder = {
  orderNumber: string
  subtotal: number
  shipping: number
  total: number
  status: string
}

/** Error carrying the API's own French message so the UI can show it verbatim. */
export class ApiError extends Error {
  readonly code: string
  readonly details: unknown
  constructor(code: string, message: string, details: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

/**
 * Turns an error into something a human can act on.
 *
 * The API returns which fields failed in `details`; showing only `message`
 * renders every validation failure as an identical "Données invalides." with no
 * way to tell what was actually wrong.
 */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.details
    if (Array.isArray(d) && d.length > 0) {
      const fields = d
        .map((x) =>
          typeof x === 'object' && x !== null && 'path' in x && 'message' in x
            ? `${String((x as { path: unknown }).path)} — ${String((x as { message: unknown }).message)}`
            : String(x),
        )
        .join(' · ')
      return `${e.message} ${fields}`
    }
    return e.message
  }
  return e instanceof Error ? e.message : 'Erreur inconnue.'
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    // Network-level failure: the API is not reachable at all.
    throw new ApiError('NETWORK', 'Impossible de joindre le serveur.', undefined)
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string; details?: unknown } }
      | null
    throw new ApiError(
      body?.error?.code ?? 'HTTP_' + res.status,
      body?.error?.message ?? 'Une erreur est survenue.',
      body?.error?.details,
    )
  }

  return (await res.json()) as T
}

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'RETURNED'
  | 'CANCELLED'

/** Buyers have no accounts, so history is keyed on the phone number. */
export type CustomerHistory = { orderCount: number; returnedCount: number }

export type AdminOrderRow = {
  id: number
  orderNumber: string
  customerName: string
  phone: string
  total: number
  status: OrderStatus
  deliveryType: 'DESK' | 'HOME'
  createdAt: string
  wilaya: { code: number; nameFr: string; nameAr: string }
  commune: { name: string }
  customer: CustomerHistory
}

export type AdminVariant = {
  id: number
  size: string
  color: string
  sku: string
  stock: number
  priceOverride: number | null
}

export type AdminProduct = {
  id: number
  name: string
  slug: string
  description: string
  basePrice: number
  categoryId: number | null
  images: string[]
  active: boolean
  createdAt: string
  supplier: string | null
  gender: Gender | null
  nameAr: string | null
  descriptionAr: string | null
  /** ISO instant; the date part is the calendar day the goods arrived. */
  arrivalDate: string | null
  category: { id: number; name: string; slug: string } | null
  type: { id: number; name: string; slug: string } | null
  typeId: number | null
  variants: AdminVariant[]
  totalStock: number
  lowStock: boolean
  /** Photos across every colour gallery, not just the legacy flat list. */
  photoCount?: number
}

export type StockPayload = {
  threshold: number
  outOfStock: number
  lowCount: number
  facets: { sizes: string[]; colors: string[] }
  data: LowStockRow[]
}

export type LowStockRow = {
  id: number
  size: string
  color: string
  sku: string
  stock: number
  product: { id: number; name: string; slug: string; active: boolean }
}

export type AdminOrderDetail = {
  id: number
  orderNumber: string
  customerName: string
  phone: string
  address: string
  deliveryType: 'DESK' | 'HOME'
  subtotal: number
  shipping: number
  total: number
  status: OrderStatus
  notes: string | null
  stockRestored: boolean
  createdAt: string
  updatedAt: string
  wilaya: { code: number; nameFr: string; nameAr: string }
  commune: { id: number; name: string }
  items: Array<{
    id: number
    variantId: number | null
    quantity: number
    unitPrice: number
    productName: string
    variantSize: string
    variantColor: string
    sku: string
  }>
  allowedTransitions: OrderStatus[]
  customer: CustomerHistory
  stockRestoredNow?: boolean
  skippedLines?: number
}

export type AdminStats = {
  pending: number
  collected7d: number
  returnRate: number
  returned: number
  totalOrders: number
  ordersToday: number
}

export type AdminOrderList = {
  data: AdminOrderRow[]
  pagination: Pagination
  counts: { all: number; byStatus: Partial<Record<OrderStatus, number>> }
}

export type StorefrontSettings = {
  heroImage: string
  heroHeadingFr: string
  heroHeadingAr: string
  heroBodyFr: string
  heroBodyAr: string
  heroCtaFr: string
  heroCtaAr: string
  qrUrl: string
  featuredProductIds: number[]
}

export type Storefront = StorefrontSettings & { featured: ProductListItem[] }

export type CarrierName = 'YALIDINE' | 'ZR_EXPRESS' | 'OTHER'

export type RateRow = {
  id: number
  code: number
  nameFr: string
  nameAr: string
  rate: { id: number; carrier: CarrierName; deskPrice: number; homePrice: number; isDefault: boolean } | null
  defaultCarrier: CarrierName | null
  isDefault: boolean
}

export type RateList = { carrier: CarrierName; data: RateRow[] }

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

export const adminApi = {
  login: (email: string, password: string) =>
    request<{ token: string; admin: { id: number; email: string; name: string } }>(
      '/admin/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),

  listOrders: (
    token: string,
    params: { status?: OrderStatus; phone?: string; page?: number; limit?: number } = {},
  ) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.phone) qs.set('phone', params.phone)
    if (params.page) qs.set('page', String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<AdminOrderList>(`/admin/orders${suffix}`, { headers: auth(token) })
  },

  getOrder: (token: string, id: number) =>
    request<AdminOrderDetail>(`/admin/orders/${id}`, { headers: auth(token) }),

  setStatus: (token: string, id: number, status: OrderStatus) =>
    request<AdminOrderDetail>(`/admin/orders/${id}/status`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ status }),
    }),

  stats: (token: string) => request<AdminStats>('/admin/stats', { headers: auth(token) }),

  // ---------------------------------------------------------------- catalogue
  listProducts: (
    token: string,
    params: {
      q?: string
      category?: string
      active?: boolean
      page?: number
      limit?: number
      sort?: 'recent' | 'arrival' | 'name'
    } = {},
  ) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.category) qs.set('category', params.category)
    if (params.active !== undefined) qs.set('active', String(params.active))
    if (params.page) qs.set('page', String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.sort) qs.set('sort', params.sort)
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<{ data: AdminProduct[]; pagination: Pagination }>(
      `/admin/products${suffix}`,
      { headers: auth(token) },
    )
  },

  getProduct: (token: string, id: number) =>
    request<AdminProduct>(`/admin/products/${id}`, { headers: auth(token) }),

  createProduct: (
    token: string,
    body: {
      name: string
      description: string
      basePrice: number
      categoryId?: number | null
      supplier?: string | null
      gender?: Gender | null
      arrivalDate?: string | null
      typeId?: number | null
    },
  ) =>
    request<AdminProduct>('/admin/products', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(body),
    }),

  updateProduct: (
    token: string,
    id: number,
    body: Partial<{
      name: string
      description: string
      basePrice: number
      categoryId: number | null
      active: boolean
      supplier: string | null
      gender: Gender | null
      arrivalDate: string | null
      typeId: number | null
    }>,
  ) =>
    request<AdminProduct>(`/admin/products/${id}`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify(body),
    }),

  listPhotos: (token: string, productId: number) =>
    request<ColourGallery[]>(`/admin/products/${productId}/photos`, { headers: auth(token) }),

  addPhoto: (token: string, productId: number, path: string, color: string | null) =>
    request<ColourGallery[]>(`/admin/products/${productId}/photos`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ path, color }),
    }),

  removePhoto: (token: string, productId: number, imageId: number) =>
    request<ColourGallery[]>(`/admin/products/${productId}/photos`, {
      method: 'DELETE',
      headers: auth(token),
      body: JSON.stringify({ imageId }),
    }),

  deleteProduct: (token: string, id: number) =>
    request<{ deleted: boolean; name: string; variantsRemoved: number; imagesRemoved: number }>(
      `/admin/products/${id}`,
      { method: 'DELETE', headers: auth(token) },
    ),

  createVariant: (
    token: string,
    productId: number,
    body: { size: string; color: string; sku: string; stock: number; priceOverride?: number | null },
  ) =>
    request<AdminVariant>(`/admin/products/${productId}/variants`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(body),
    }),

  updateVariant: (token: string, id: number, body: Partial<AdminVariant>) =>
    request<AdminVariant>(`/admin/variants/${id}`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify(body),
    }),

  deleteVariant: (token: string, id: number) =>
    request<{ deleted: boolean; sku: string }>(`/admin/variants/${id}`, {
      method: 'DELETE',
      headers: auth(token),
    }),

  listRates: (token: string, carrier: CarrierName) =>
    request<RateList>(`/admin/shipping-rates?carrier=${carrier}`, { headers: auth(token) }),

  saveRates: (
    token: string,
    carrier: CarrierName,
    rates: Array<{ wilayaCode: number; deskPrice: number; homePrice: number }>,
  ) =>
    request<RateList>('/admin/shipping-rates', {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ carrier, rates }),
    }),

  setDefaultCarrier: (token: string, carrier: CarrierName, wilayaCodes: number[]) =>
    request<RateList>('/admin/shipping-rates/default', {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ carrier, wilayaCodes }),
    }),

  lowStock: (token: string) => request<StockPayload>('/admin/stock', { headers: auth(token) }),

  listCategories: (token: string) =>
    request<AdminCategory[]>('/admin/categories', { headers: auth(token) }),

  createCategory: (token: string, body: { name: string; nameAr?: string | null }) =>
    request<AdminCategory>('/admin/categories', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(body),
    }),

  // The slug is deliberately not re-derived server-side on rename: it lives in
  // storefront URLs, so a typo fix must not break a link someone shared.
  updateCategory: (token: string, id: number, body: { name?: string; nameAr?: string | null }) =>
    request<AdminCategory>(`/admin/categories/${id}`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify(body),
    }),

  deleteCategory: (token: string, id: number) =>
    request<{ deleted: boolean; name: string }>(`/admin/categories/${id}`, {
      method: 'DELETE',
      headers: auth(token),
    }),

  listProductTypes: (token: string) =>
    request<AdminProductType[]>('/admin/product-types', { headers: auth(token) }),

  createProductType: (token: string, name: string) =>
    request<AdminProductType>('/admin/product-types', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ name }),
    }),

  // Same contract as updateCategory: the slug is not re-derived on rename,
  // because it lives in storefront filter URLs.
  updateProductType: (token: string, id: number, body: { name?: string; nameAr?: string | null }) =>
    request<AdminProductType>(`/admin/product-types/${id}`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify(body),
    }),

  deleteProductType: (token: string, id: number) =>
    request<{ deleted: boolean; name: string }>(`/admin/product-types/${id}`, {
      method: 'DELETE',
      headers: auth(token),
    }),

  // ------------------------------------------------------------------ images
  getSettings: (token: string) =>
    request<StorefrontSettings>('/admin/settings', { headers: auth(token) }),

  saveSettings: (token: string, body: Partial<StorefrontSettings>) =>
    request<StorefrontSettings>('/admin/settings', {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify(body),
    }),

  signStorefrontUpload: (token: string, filename: string) =>
    request<{ path: string; signedUrl: string; token: string }>('/admin/storefront/image/sign', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ filename }),
    }),

  storageStatus: (token: string) =>
    request<{ configured: boolean }>('/admin/storage/status', { headers: auth(token) }),

  signUpload: (token: string, productId: number, filename: string) =>
    request<{ path: string; signedUrl: string; token: string }>(
      `/admin/products/${productId}/images/sign`,
      { method: 'POST', headers: auth(token), body: JSON.stringify({ filename }) },
    ),

  attachImage: (token: string, productId: number, path: string) =>
    request<{ images: string[] }>(`/admin/products/${productId}/images`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ path }),
    }),

  detachImage: (token: string, productId: number, url: string) =>
    request<{ images: string[] }>(`/admin/products/${productId}/images`, {
      method: 'DELETE',
      headers: auth(token),
      body: JSON.stringify({ url }),
    }),
}

/**
 * Uploads straight to Supabase with a server-minted signed URL. The file never
 * touches our API, so there is no body-size ceiling and the service-role key
 * stays on the server.
 */
export async function uploadToSignedUrl(signedUrl: string, file: File): Promise<void> {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) {
    throw new ApiError('UPLOAD_FAILED', `Envoi du fichier échoué (${res.status}).`, undefined)
  }
}

export const api = {
  listProducts: (
    params: {
      category?: string
      type?: string
      color?: string
      /** Only FEMME or HOMME — UNISEXE is folded into both server-side. */
      gender?: 'FEMME' | 'HOMME'
      q?: string
      page?: number
      limit?: number
    } = {},
  ) => {
    const qs = new URLSearchParams()
    if (params.category) qs.set('category', params.category)
    if (params.type) qs.set('type', params.type)
    if (params.color) qs.set('color', params.color)
    if (params.gender) qs.set('gender', params.gender)
    if (params.q) qs.set('q', params.q)
    if (params.page) qs.set('page', String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<{ data: ProductListItem[]; pagination: Pagination }>(`/products${suffix}`)
  },

  listFilters: () => request<StorefrontFilters>('/products/filters'),

  getStorefront: () => request<Storefront>('/products/storefront'),

  getProduct: (slug: string) => request<Product>(`/products/${encodeURIComponent(slug)}`),

  listWilayas: () => request<Wilaya[]>('/wilayas'),

  listCommunes: (code: number) =>
    request<{ wilaya: { code: number; nameFr: string; nameAr: string }; communes: Commune[] }>(
      `/wilayas/${code}/communes`,
    ),

  createOrder: (body: {
    customerName: string
    phone: string
    wilayaCode: number
    communeId: number
    address: string
    deliveryType: 'DESK' | 'HOME'
    notes?: string | null
    items: Array<{ variantId: number; quantity: number }>
  }) => request<CreatedOrder>('/orders', { method: 'POST', body: JSON.stringify(body) }),
}
