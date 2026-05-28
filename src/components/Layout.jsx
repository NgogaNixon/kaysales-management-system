import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const clientNavItems = [
  { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  { path: '/products', icon: '📦', label: 'Products' },
  { path: '/sales', icon: '💰', label: 'Sales' },
  { path: '/credits', icon: '💳', label: 'Credits' },
  { path: '/analysis', icon: '📈', label: 'Analysis' },
]

const adminNavItems = [
  { path: '/admin', icon: '👑', label: 'Dashboard' },
  { path: '/admin/clients', icon: '👥', label: 'Client Management' },
  { path: '/admin/subscriptions', icon: '💳', label: 'Subscriptions' },
  { path: '/admin/reports', icon: '📊', label: 'System Reports' },
]

export default function Layout({ children }) {
  const { profile, logout } = useAuth()
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
    <div className="min-h-screen bg-gray-950 text-white flex">

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-300 fixed h-full z-40`}>

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
              {sidebarOpen && <span>{item.label}</span>}
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
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-900 hover:text-red-300 transition text-sm font-medium"
          >
            <span className="text-lg">🚪</span>
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 ${sidebarOpen ? 'ml-64' : 'ml-16'} transition-all duration-300 min-h-screen bg-gray-950`}>
        {children}
      </main>

    </div>
  )
}