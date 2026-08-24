const BASE = import.meta.env['VITE_API_URL'] ?? 'http://localhost:4000/api'

export type Category = { name: string; slug: string }
/** What the garment IS — orthogonal to Category. A robe is femme AND robe. */
export type ProductTypeRef = { name: string; slug: string }
export type AdminProductType = { id: number; name: string; slug: string; _count?: { products: number } }
export type StorefrontFilters = {
  categories: Category[]
  types: ProductTypeRef[]
  colors: string[]
}

export type ProductListItem = {
  id: number
  name: string
  slug: string
  basePrice: number
  images: string[]
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
  slug: string
  description: string
  basePrice: number
  images: string[]
  createdAt: string
  /** Null for an uncategorised product — Product.categoryId is nullable. */
  category: Category | null
  type: ProductTypeRef | null
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

export type Commune = { id: number; name: string }

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
  /** ISO instant; the date part is the calendar day the goods arrived. */
  arrivalDate: string | null
  category: { id: number; name: string; slug: string } | null
  type: { id: number; name: string; slug: string } | null
  typeId: number | null
  variants: AdminVariant[]
  totalStock: number
  lowStock: boolean
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
      arrivalDate: string | null
      typeId: number | null
    }>,
  ) =>
    request<AdminProduct>(`/admin/products/${id}`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify(body),
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

  lowStock: (token: string) => request<StockPayload>('/admin/stock', { headers: auth(token) }),

  listProductTypes: (token: string) =>
    request<AdminProductType[]>('/admin/product-types', { headers: auth(token) }),

  createProductType: (token: string, name: string) =>
    request<AdminProductType>('/admin/product-types', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ name }),
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
      q?: string
      page?: number
      limit?: number
    } = {},
  ) => {
    const qs = new URLSearchParams()
    if (params.category) qs.set('category', params.category)
    if (params.type) qs.set('type', params.type)
    if (params.color) qs.set('color', params.color)
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
    request<{ wilaya: { code: number; nameFr: string }; communes: Commune[] }>(
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
