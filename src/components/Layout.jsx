import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

const clientNavItems = [
  { path: '/dashboard', icon: '📊', labelKey: 'dashboard' },
  { path: '/products', icon: '📦', labelKey: 'products' },
  { path: '/sales', icon: '💰', labelKey: 'sales' },
  { path: '/credits', icon: '💳', labelKey: 'credits' },
  { path: '/analysis', icon: '📈', labelKey: 'analysis' },
]

const adminNavItems = [
  { path: '/admin', icon: '👑', labelKey: 'dashboard' },
  { path: '/admin/clients', icon: '👥', labelKey: 'clients' },
  { path: '/admin/subscriptions', icon: '💳', labelKey: 'subscriptions' },
  { path: '/admin/reports', icon: '📊', labelKey: 'reports' },
{ path: '/admin/admin-reports', icon: '📑', labelKey: 'adminReports' },
  { path: '/admin/activity', icon: '📋', labelKey: 'activity' },
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
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ===== DESKTOP SIDEBAR ===== */}
      <aside className={`hidden md:flex ${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 border-r border-gray-800 flex-col transition-all duration-300 fixed h-full z-40`}>

        {/* Logo */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">K</span>
              </div>
              <div>
                <span className="font-bold text-white text-sm">KaySales</span>
                {isAdmin && (
                  <span className="block text-xs text-yellow-400">Admin Portal</span>
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
                  ? isAdmin ? 'bg-yellow-500 text-gray-900' : 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
            >
              <span className="text-lg">{item.icon}</span>
              {sidebarOpen && <span>{t(item.labelKey)}</span>}
            </button>
          ))}
        </nav>

        {/* User & Logout */}
        <div className="p-3 border-t border-gray-800">
          {sidebarOpen && (
            <div className="px-3 py-2 mb-2">
              <p className="text-white text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-gray-500 text-xs truncate">{profile?.email}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                isAdmin
                  ? 'bg-yellow-500 text-gray-900'
                  : profile?.plan_type === 'premium'
                  ? 'bg-purple-600 text-white'
                  : 'bg-blue-600 text-white'
              }`}>
                {isAdmin ? '👑 Admin' : profile?.plan_type === 'premium' ? '⭐ Premium' : '📦 Standard'}
              </span>
            </div>
          )}

          {/* Language Toggle */}
          {sidebarOpen && (
            <button
              onClick={toggleLanguage}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition text-sm font-medium mb-1"
            >
              <span className="text-lg">{language === 'en' ? '🇫🇷' : '🇬🇧'}</span>
              <span>{language === 'en' ? 'Français' : 'English'}</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-900 hover:text-red-300 transition text-sm font-medium"
          >
            <span className="text-lg">🚪</span>
            {sidebarOpen && <span>{t('logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Desktop Main Content */}
      <main className={`hidden md:block ${sidebarOpen ? 'ml-64' : 'ml-16'} transition-all duration-300 min-h-screen bg-gray-950`}>
        {children}
      </main>

      {/* ===== MOBILE LAYOUT ===== */}
      <div className="md:hidden flex flex-col min-h-screen">

        {/* Mobile Header */}
        <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            <div>
              <span className="font-bold text-white text-sm">KaySales</span>
              {isAdmin && <span className="block text-xs text-yellow-400">Admin</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition font-medium"
            >
              {language === 'en' ? '🇫🇷 FR' : '🇬🇧 EN'}
            </button>
            <span className={`text-xs px-2 py-1 rounded-full ${
              isAdmin
                ? 'bg-yellow-500 text-gray-900'
                : profile?.plan_type === 'premium'
                ? 'bg-purple-600 text-white'
                : 'bg-blue-600 text-white'
            }`}>
              {isAdmin ? '👑' : profile?.plan_type === 'premium' ? '⭐' : '📦'}
            </span>
            <button
              onClick={handleLogout}
              className="text-red-400 text-sm px-2 py-1 rounded hover:bg-red-900 transition"
            >
              🚪
            </button>
          </div>
        </header>

        {/* Mobile Content */}
        <div className="flex-1 pb-24 overflow-y-auto">
          {children}
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-50">
          <div className="flex items-center justify-around px-2 py-2 pb-safe" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition ${
                  isActive(item.path)
                    ? isAdmin ? 'text-yellow-400' : 'text-blue-400'
                    : 'text-gray-500'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-xs font-medium">{t(item.labelKey)}</span>
              </button>
            ))}
          </div>
        </nav>

      </div>

    </div>
  )
}