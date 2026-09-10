import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

const clientNavItems = [
  { path: '/dashboard', icon: '', labelKey: 'dashboard' },
  { path: '/products', icon: '', labelKey: 'products' },
  { path: '/sales', icon: '', labelKey: 'sales' },
  { path: '/credits', icon: '', labelKey: 'credits' },
  { path: '/quotations', icon: '', labelKey: 'quotations' },
  { path: '/analysis', icon: '', labelKey: 'analysis' },
  { path: '/account-settings', icon: '', labelKey: 'accountSettings' },
]

const adminNavItems = [
  { path: '/admin', icon: '', labelKey: 'dashboard' },
  { path: '/admin/clients', icon: '', labelKey: 'clients' },
  { path: '/admin/subscriptions', icon: '', labelKey: 'subscriptions' },
  { path: '/admin/reports', icon: '', labelKey: 'reports' },
{ path: '/admin/admin-reports', icon: '', labelKey: 'adminReports' },
  { path: '/admin/activity', icon: '', labelKey: 'activity' },
  { path: '/admin/devices', icon: '', labelKey: 'devices' },
]

export default function Layout({ children }) {
  const { profile, logout } = useAuth()
  const { language, toggleLanguage, t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const isAdmin = profile?.role === 'admin'
  const navItems = isAdmin ? adminNavItems : clientNavItems

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-h-screen bg-surface text-white">

      {/* ===== DESKTOP SIDEBAR ===== */}
      <aside className={`hidden md:flex ${sidebarOpen ? 'w-64' : 'w-16'} bg-surface-elevated border-r border-surface-border flex-col transition-all duration-300 fixed h-full z-40`}>

        {/* Logo */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">K</span>
              </div>
              <div>
                <span className="font-bold text-white text-sm">KaySales</span>
                {isAdmin && (
                  <span className="block text-xs text-admin-light">Admin Portal</span>
                )}
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-400 hover:text-white transition p-1 rounded"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm font-medium
                ${isActive(item.path)
                  ? isAdmin ? 'bg-admin text-white' : 'bg-primary text-white'
                  : 'text-gray-400 hover:bg-surface hover:text-white'
                }`}
            >
              <span className="text-lg">{item.icon}</span>
              {sidebarOpen && <span>{t(item.labelKey)}</span>}
            </button>
          ))}
        </nav>

        {/* User & Logout */}
        <div className="p-3 border-t border-surface-border">
          {sidebarOpen && (
            <div className="px-3 py-2 mb-2">
              <p className="text-white text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-gray-500 text-xs truncate">{profile?.email}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                isAdmin
                  ? 'bg-admin text-white'
                  : profile?.plan_type === 'premium'
                  ? 'bg-purple-600 text-white'
                  : 'bg-primary text-white'
              }`}>
                {isAdmin ? 'Admin' : profile?.plan_type === 'premium' ? 'Premium' : 'Standard'}
              </span>
            </div>
          )}

          {/* Language Toggle */}
          {sidebarOpen && (
            <button
              onClick={toggleLanguage}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-surface hover:text-white transition text-sm font-medium mb-1"
            >
              <span className="text-xs font-bold">{language === 'en' ? 'FR' : 'EN'}</span>
              <span>{language === 'en' ? 'Français' : 'English'}</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-900 hover:text-red-300 transition text-sm font-medium"
          >
            {sidebarOpen ? <span>{t('logout')}</span> : <span className="text-xs font-bold">Out</span>}
          </button>
        </div>
      </aside>

      {/* Desktop Main Content */}
      <main className={`hidden md:block ${sidebarOpen ? 'ml-64' : 'ml-16'} transition-all duration-300 min-h-screen bg-surface`}>
        {children}
      </main>

      {/* ===== MOBILE LAYOUT ===== */}
      <div className="md:hidden min-h-screen bg-surface">

        {/* Mobile Header */}
        <header className="sticky top-0 bg-surface-elevated border-b border-surface-border px-4 py-3 flex items-center justify-between z-40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            <div>
              <span className="font-bold text-white text-sm">KaySales</span>
              {isAdmin && <span className="block text-xs text-admin-light">Admin</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="text-xs px-2 py-1 rounded-lg bg-surface text-gray-300 hover:bg-surface-border transition font-medium"
            >
              {language === 'en' ? 'FR' : 'EN'}
            </button>
            <span className={`text-xs px-2 py-1 rounded-full ${
              isAdmin
                ? 'bg-admin text-white'
                : profile?.plan_type === 'premium'
                ? 'bg-purple-600 text-white'
                : 'bg-primary text-white'
            }`}>
              {isAdmin ? 'Admin' : profile?.plan_type === 'premium' ? 'Premium' : 'Standard'}
            </span>
            <button
              onClick={handleLogout}
              className="text-red-400 text-xs font-bold px-2 py-1 rounded hover:bg-red-900 transition"
            >
              Out
            </button>
          </div>
        </header>

        {/* Mobile Content — page scrolls naturally; pb-24 keeps content clear of the fixed nav below */}
        <div className="pb-24">
          {children}
        </div>

        {/* Mobile Bottom Navigation — truly fixed to the real browser viewport, no JS height math */}
        <nav className="fixed bottom-0 inset-x-0 bg-surface-elevated border-t border-surface-border z-30 safe-bottom">
          <div className="flex items-center overflow-x-auto px-1 py-2 gap-1">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition flex-shrink-0 min-w-[64px] ${
                  isActive(item.path)
                    ? isAdmin ? 'text-admin-light' : 'text-primary-light'
                    : 'text-gray-500'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-xs font-medium whitespace-nowrap">{t(item.labelKey)}</span>
              </button>
            ))}
          </div>
        </nav>

      </div>

    </div>
  )
}
