import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, adminApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'

export function AdminLogin() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await adminApi.login(email.trim(), password)
      signIn(res.token, res.admin)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-gutter">
      <form
        onSubmit={submit}
        className="flex w-full max-w-[420px] flex-col gap-5 rounded-lg border border-line p-7 lg:p-8"
      >
        <div className="flex flex-col gap-1">
          <span className="wordmark text-[22px]">Casbah</span>
          <span className="text-meta text-ink-soft">Administration</span>
        </div>

        <h1 className="text-h3">Connexion</h1>

        <label className="flex flex-col gap-1.5">
          <span className="text-meta text-ink-soft">E-mail</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-[12px] border border-line bg-field p-field text-body outline-none focus:border-green"
            placeholder="admin@casbah.dz"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-meta text-ink-soft">Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-[12px] border border-line bg-field p-field text-body outline-none focus:border-green"
          />
        </label>

        {error && (
          <p className="rounded-md border border-rust/40 bg-rust/5 p-3 text-meta text-rust">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="rounded-pill border border-green bg-green py-[14px] text-sm font-semibold text-cream disabled:cursor-not-allowed disabled:border-line disabled:bg-line disabled:text-white"
        >
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>

        <p className="text-meta text-ink-soft">
          Accès réservé au personnel de la boutique. Les clients n'ont pas de compte.
        </p>
      </form>
    </div>
  )
}
