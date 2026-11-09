import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Landing from './pages/Landing'
import Login from './pages/auth/Login'

const Signup = lazy(() => import('./pages/auth/Signup'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Products = lazy(() => import('./pages/Products'))
const Sales = lazy(() => import('./pages/Sales'))
const Credits = lazy(() => import('./pages/Credits'))
const Quotations = lazy(() => import('./pages/Quotations'))
const Analysis = lazy(() => import('./pages/Analysis'))
const ChoosePlan = lazy(() => import('./pages/ChoosePlan'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const ClientManagement = lazy(() => import('./pages/admin/ClientManagement'))
const Subscriptions = lazy(() => import('./pages/admin/Subscriptions'))
const SystemReports = lazy(() => import('./pages/admin/SystemReports'))
const ActivityLog = lazy(() => import('./pages/admin/ActivityLog'))
const Devices = lazy(() => import('./pages/admin/Devices'))
const AdminReports = lazy(() => import('./pages/admin/AdminReports'))
const Trash = lazy(() => import('./pages/admin/Trash'))
const Organizations = lazy(() => import('./pages/admin/Organizations'))
const AccountSettings = lazy(() => import('./pages/AccountSettings'))
const Team = lazy(() => import('./pages/Team'))
const TeamActivity = lazy(() => import('./pages/TeamActivity'))
const Approvals = lazy(() => import('./pages/Approvals'))

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <ErrorBoundary>
          <Suspense fallback={<div className="min-h-screen bg-surface flex items-center justify-center text-gray-400">Loading...</div>}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/choose-plan" element={<ChoosePlan />} />

            {/* Protected client routes */}
            <Route path="/dashboard" element={<ProtectedRoute module="dashboard"><Dashboard /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute module="products"><Products /></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute module="sales"><Sales /></ProtectedRoute>} />
            <Route path="/credits" element={<ProtectedRoute module="credits"><Credits /></ProtectedRoute>} />
            <Route path="/quotations" element={<ProtectedRoute module="quotations"><Quotations /></ProtectedRoute>} />
            <Route path="/account-settings" element={<ProtectedRoute module="settings"><AccountSettings /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute module="team"><Team /></ProtectedRoute>} />
            <Route path="/team-activity" element={<ProtectedRoute module="team"><TeamActivity /></ProtectedRoute>} />
            <Route path="/approvals" element={<ProtectedRoute><Approvals /></ProtectedRoute>} />
            <Route path="/analysis" element={<ProtectedRoute module="analysis"><Analysis /></ProtectedRoute>} />

            {/* Protected admin routes */}
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/clients" element={<ProtectedRoute><ClientManagement /></ProtectedRoute>} />
            <Route path="/admin/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
            <Route path="/admin/organizations" element={<ProtectedRoute><Organizations /></ProtectedRoute>} />
            <Route path="/admin/reports" element={<ProtectedRoute><SystemReports /></ProtectedRoute>} />
            <Route path="/admin/activity" element={<ProtectedRoute><ActivityLog /></ProtectedRoute>} />
            <Route path="/admin/devices" element={<ProtectedRoute><Devices /></ProtectedRoute>} />
            <Route path="/admin/admin-reports" element={<ProtectedRoute><AdminReports /></ProtectedRoute>} />
            <Route path="/admin/trash" element={<ProtectedRoute><Trash /></ProtectedRoute>} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App