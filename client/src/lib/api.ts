const BASE = import.meta.env['VITE_API_URL'] ?? 'http://localhost:4000/api'

export type Category = { name: string; slug: string }

export type ProductListItem = {
  id: number
  name: string
  slug: string
  basePrice: number
  images: string[]
  category: Category
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
  category: Category
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

export type AdminOrderRow = {
  id: number
  orderNumber: string
  customerName: string
  phone: string
  total: number
  status: OrderStatus
  deliveryType: 'DESK' | 'HOME'
  createdAt: string
  wilaya: { code: number; nameFr: string }
  commune: { name: string }
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
}

export const api = {
  listProducts: (params: { category?: string; q?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.category) qs.set('category', params.category)
    if (params.q) qs.set('q', params.q)
    if (params.page) qs.set('page', String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<{ data: ProductListItem[]; pagination: Pagination }>(`/products${suffix}`)
  },

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
