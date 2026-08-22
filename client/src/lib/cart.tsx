import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type CartLine = {
  variantId: number
  slug: string
  productName: string
  size: string
  color: string
  sku: string
  /**
   * Display only. The server re-reads every price from the catalogue when the
   * order is created, so a tampered value here changes what the customer sees
   * and nothing else.
   */
  unitPrice: number
  quantity: number
}

type CartValue = {
  lines: CartLine[]
  count: number
  subtotal: number
  add: (line: CartLine) => void
  setQty: (variantId: number, quantity: number) => void
  remove: (variantId: number) => void
  clear: () => void
}

const STORAGE_KEY = 'casbah.cart.v1'
const CartContext = createContext<CartValue | null>(null)

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CartLine[]) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  }, [lines])

  const add = useCallback((line: CartLine) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variantId === line.variantId)
      if (i === -1) return [...prev, line]
      const next = [...prev]
      const existing = next[i]!
      next[i] = { ...existing, quantity: Math.min(99, existing.quantity + line.quantity) }
      return next
    })
  }, [])

  const setQty = useCallback((variantId: number, quantity: number) => {
    setLines((prev) =>
      prev.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)).filter((l) => l.quantity > 0),
    )
  }, [])

  const remove = useCallback((variantId: number) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0),
      add,
      setQty,
      remove,
      clear,
    }),
    [lines, add, setQty, remove, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
