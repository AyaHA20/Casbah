import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { CartProvider } from './lib/cart'
import { AuthProvider, useAuth } from './lib/auth'
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

function StorefrontLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

/** Admin chrome is separate: no storefront nav, no cart, no footer. */
function AdminLayout() {
  const { token } = useAuth()
  if (!token) return <Navigate to="/admin/login" replace />

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader now={new Date()} />
      {/* The design's 1440 frame: main column + 420px detail panel. */}
      <main className="flex-1 lg:grid lg:grid-cols-[1fr_420px] lg:items-start">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
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
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminCommandes />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  )
}
