import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { CartProvider } from './lib/cart'
import { LangProvider } from './lib/i18n'
import { AuthProvider, useAuth } from './lib/auth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { AdminHeader } from './components/admin/AdminHeader'
import { Boutique } from './pages/Boutique'
import { Produit } from './pages/Produit'
import { Commande } from './pages/Commande'
import { Livraison } from './pages/Livraison'
import { Contact } from './pages/Contact'
import { AdminLogin } from './pages/admin/Login'
import { AdminCommandes } from './pages/admin/Commandes'
import { AdminProduits } from './pages/admin/Produits'
import { AdminStock } from './pages/admin/Stock'
import { AdminVitrine } from './pages/admin/Vitrine'
import { AdminImprimer } from './pages/admin/Imprimer'

function StorefrontLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <ErrorBoundary label="storefront">
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  )
}

/** Gate only — used by the print sheet, which needs auth but not the chrome. */
function RequireAuth() {
  const { token } = useAuth()
  return token ? <Outlet /> : <Navigate to="/admin/login" replace />
}

/** Admin chrome: no storefront nav, no cart, no footer. */
function AdminLayout() {
  const { token } = useAuth()
  if (!token) return <Navigate to="/admin/login" replace />

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader now={new Date()} />
      {/* The design's 1440 frame: main column + 420px detail panel. Pages
          without a panel span both columns. */}
      <main className="flex-1 lg:grid lg:grid-cols-[1fr_420px] lg:items-start">
        <ErrorBoundary label="admin">
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<StorefrontLayout />}>
              <Route path="/" element={<Boutique />} />
              <Route path="/p/:slug" element={<Produit />} />
              <Route path="/commande" element={<Commande />} />
              <Route path="/livraison" element={<Livraison />} />
              <Route path="/contact" element={<Contact />} />
            </Route>

            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Print sheet sits outside the admin grid so it can own the page. */}
            <Route element={<RequireAuth />}>
              <Route path="/admin/commandes/:id/imprimer" element={<AdminImprimer />} />
            </Route>

            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/commandes" replace />} />
              <Route path="/admin/commandes" element={<AdminCommandes />} />
              <Route path="/admin/produits" element={<AdminProduits />} />
              <Route path="/admin/stock" element={<AdminStock />} />
              <Route path="/admin/vitrine" element={<AdminVitrine />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </LangProvider>
  )
}
