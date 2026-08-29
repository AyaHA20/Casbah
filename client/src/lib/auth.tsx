import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type Admin = {
  id: number
  email: string
  name: string
  /**
   * Label only. Every write is refused by the server for this account whatever
   * the browser believes — see server/src/middleware/reject-read-only.ts.
   * Optional so a profile saved before this existed still parses.
   */
  readOnly?: boolean
}

type AuthValue = {
  token: string | null
  admin: Admin | null
  signIn: (token: string, admin: Admin) => void
  signOut: () => void
}

const KEY_TOKEN = 'casbah.admin.token'
const KEY_ADMIN = 'casbah.admin.profile'

const AuthContext = createContext<AuthValue | null>(null)

function readAdmin(): Admin | null {
  try {
    const raw = localStorage.getItem(KEY_ADMIN)
    return raw ? (JSON.parse(raw) as Admin) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // localStorage means a 12h session survives a refresh. It is readable by any
  // script on the page, so an XSS bug would leak the token — acceptable for an
  // admin-only tool, worth revisiting if this ever renders untrusted content.
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(KEY_TOKEN))
  const [admin, setAdmin] = useState<Admin | null>(readAdmin)

  const signIn = useCallback((t: string, a: Admin) => {
    localStorage.setItem(KEY_TOKEN, t)
    localStorage.setItem(KEY_ADMIN, JSON.stringify(a))
    setToken(t)
    setAdmin(a)
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY_TOKEN)
    localStorage.removeItem(KEY_ADMIN)
    setToken(null)
    setAdmin(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ token, admin, signIn, signOut }),
    [token, admin, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
