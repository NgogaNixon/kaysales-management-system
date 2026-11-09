import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { ROLE_LABELS, getRoleName } from '../lib/permissions'

// feature: the plan feature a link needs. Links whose feature is not included
// in the client's plan are hidden (see can() in AuthContext / planConfig.js).
// module: the area of the system a link belongs to. Company staff only see the
// links for areas they have access to (see permissions.js). Normal clients see
// everything except the company-only Team link.
const clientNavItems = [
  { path: '/dashboard', icon: '', labelKey: 'dashboard', module: 'dashboard' },
  { path: '/products', icon: '', labelKey: 'products', module: 'products' },
  { path: '/sales', icon: '', labelKey: 'sales', module: 'sales' },
  { path: '/credits', icon: '', labelKey: 'credits', module: 'credits' },
  { path: '/quotations', icon: '', labelKey: 'quotations', module: 'quotations', feature: 'quotations' },
  { path: '/analysis', icon: '', labelKey: 'analysis', module: 'analysis' },
  { path: '/team', icon: '', labelKey: 'team', label: 'Team', labelFr: 'Équipe', module: 'team' },
  { path: '/team-activity', icon: '', labelKey: 'teamActivity', label: 'Team activity', labelFr: 'Activité de l’équipe', module: 'team', ceoOnly: true },
  // Shown to everyone in a company: approvers see the inbox, others see their own requests
  { path: '/approvals', icon: '', labelKey: 'approvals', label: 'Approvals', labelFr: 'Approbations', companyOnly: true },
  { path: '/account-settings', icon: '', labelKey: 'accountSettings', module: 'settings' },
]

const adminNavItems = [
  { path: '/admin', icon: '', labelKey: 'dashboard' },
  { path: '/admin/clients', icon: '', labelKey: 'clients' },
  { path: '/admin/subscriptions', icon: '', labelKey: 'subscriptions' },
  { path: '/admin/organizations', icon: '', labelKey: 'companies', label: 'Companies', labelFr: 'Entreprises' },
  { path: '/admin/reports', icon: '', labelKey: 'reports' },
{ path: '/admin/admin-reports', icon: '', labelKey: 'adminReports' },
  { path: '/admin/activity', icon: '', labelKey: 'activity' },
  { path: '/admin/devices', icon: '', labelKey: 'devices' },
  { path: '/admin/trash', icon: '', labelKey: 'trash' },
]

export default function Layout({ children }) {
  const { profile, myProfile, logout, can, canView, canWrite, planId, planLabel, isTrial, orgRole, organization, membership } = useAuth()
  const { language, toggleLanguage, t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isAdmin = profile?.role === 'admin'
  const navItems = isAdmin
    ? adminNavItems
    : clientNavItems
        .filter(
          (item) =>
            (!item.feature || can(item.feature)) &&
            (!item.module || canView(item.module)) &&
            (!item.companyOnly || !!orgRole) &&
            (!item.ceoOnly || orgRole === 'ceo')
        )
        .map((item) =>
          item.path === '/approvals' && !canWrite('approvals') ? { ...item, label: 'My requests', labelFr: 'Mes demandes' } : item
        )

  // Number of requests waiting for this person to decide (approvers only)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const isApprover = !isAdmin && !!orgRole && canWrite('approvals')
  useEffect(() => {
    if (!isApprover) return
    let active = true
    supabase
      .from('approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => {
        if (active) setPendingApprovals(count || 0)
      })
    return () => {
      active = false
    }
  }, [isApprover, location.pathname])

  // Number of products running low (for the people who manage stock)
  const [lowStockCount, setLowStockCount] = useState(0)
  const watchesStock = !isAdmin && canWrite('products')
  useEffect(() => {
    if (!watchesStock || !profile?.id) return
    let active = true
    const loadLowStock = async () => {
      // One light count from the database
      const { data: count, error } = await supabase.rpc('low_stock_count', { p_owner: profile.id })
      if (!error) {
        if (active) setLowStockCount(count || 0)
        return
      }
      // The database function is not installed yet: count in the browser instead
      const { data } = await supabase
        .from('products')
        .select('quantity, low_stock_threshold')
        .eq('user_id', profile.id)
      const low = (data || []).filter((p) => p.quantity < (p.low_stock_threshold || 3))
      if (active) setLowStockCount(low.length)
    }
    loadLowStock()
    return () => {
      active = false
    }
  }, [watchesStock, profile?.id, location.pathname])

  // Company staff work as the company owner, so show the person's OWN name
  const displayProfile = myProfile || profile
  const inCompany = !!orgRole

  // Badge shown under the user's name (desktop) and in the mobile header
  const planBadgeText = isAdmin
    ? 'Admin'
    : inCompany
    ? (orgRole === 'ceo' ? ROLE_LABELS.ceo : getRoleName(membership))
    : isTrial
    ? `${planLabel} Trial`
    : planLabel
  const planBadgeColor = isAdmin
    ? 'bg-admin text-white'
    : inCompany
    ? 'bg-emerald-600 text-white'
    : planId === 'premium'
    ? 'bg-purple-600 text-white'
    : planId === 'organization'
    ? 'bg-emerald-600 text-white'
    : 'bg-primary text-white'

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
              {sidebarOpen && <span>{(language === 'fr' && item.labelFr) || item.label || t(item.labelKey)}</span>}
              {item.path === '/approvals' && isApprover && pendingApprovals > 0 && (
                <span className="ml-auto bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingApprovals}</span>
              )}
              {item.path === '/products' && watchesStock && lowStockCount > 0 && (
                <span className="ml-auto bg-orange-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{lowStockCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User & Logout */}
        <div className="p-3 border-t border-surface-border">
          {sidebarOpen && (
            <div className="px-3 py-2 mb-2">
              <p className="text-white text-sm font-medium truncate">{displayProfile?.full_name}</p>
              <p className="text-gray-500 text-xs truncate">{displayProfile?.email}</p>
              {inCompany && organization?.name && (
                <p className="text-gray-500 text-xs truncate">{organization.name}</p>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${planBadgeColor}`}>
                {planBadgeText}
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
        <header className="sticky top-0 bg-surface-elevated border-b border-surface-border z-40">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">K</span>
              </div>
              <div>
                <span className="font-bold text-white text-sm">KaySales</span>
                {isAdmin && <span className="block text-xs text-admin-light">Admin</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleLanguage}
                className="text-xs px-2 py-1 rounded-lg bg-surface text-gray-300 hover:bg-surface-border transition font-medium"
              >
                {language === 'en' ? 'FR' : 'EN'}
              </button>
              <span className={`text-xs px-2 py-1 rounded-full ${planBadgeColor}`}>
                {planBadgeText}
              </span>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface text-white hover:bg-surface-border transition"
                aria-label="Open menu"
              >
                <div className="space-y-1.5">
                  <span className="block w-6 h-0.5 bg-white"></span>
                  <span className="block w-6 h-0.5 bg-white"></span>
                  <span className="block w-6 h-0.5 bg-white"></span>
                </div>
              </button>
            </div>
          </div>

          {/* Mobile Menu — full-width panel that drops down under the header, closes on selection */}
          {mobileMenuOpen && (
            <div className="border-t border-surface-border px-4 py-4">
              <nav className="flex flex-col divide-y divide-surface-border">
                {navItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setMobileMenuOpen(false) }}
                    className={`w-full text-left py-3 text-base font-bold uppercase tracking-wide transition ${
                      isActive(item.path)
                        ? isAdmin ? 'text-admin-light' : 'text-primary-light'
                        : 'text-white hover:text-gray-300'
                    }`}
                  >
                    {(language === 'fr' && item.labelFr) || item.label || t(item.labelKey)}
                    {item.path === '/approvals' && isApprover && pendingApprovals > 0 && (
                      <span className="ml-2 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full align-middle">{pendingApprovals}</span>
                    )}
                    {item.path === '/products' && watchesStock && lowStockCount > 0 && (
                      <span className="ml-2 bg-orange-600 text-white text-xs font-bold px-2 py-0.5 rounded-full align-middle">{lowStockCount}</span>
                    )}
                  </button>
                ))}
              </nav>
              <button
                onClick={handleLogout}
                className="mt-4 w-full sm:w-auto px-6 py-3 rounded-full bg-primary hover:bg-primary-hover text-white font-bold transition"
              >
                {t('logout')} →
              </button>
            </div>
          )}
        </header>

        {/* Mobile Content — page scrolls naturally, no fixed bottom nav to clear anymore */}
        <div>
          {children}
        </div>

      </div>

    </div>
  )
}
