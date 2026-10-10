import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Layout from '../../components/Layout'
import { useNavigate } from 'react-router-dom'

export default function AdminDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    totalClients: 0,
    pendingApprovals: 0,
    activeSubscriptions: 0,
    expiringSoon: 0,
    expired: 0,
    estimatedRevenue: 0,
  })
  const [expiringSoonClients, setExpiringSoonClients] = useState([])
  const [expiredClients, setExpiredClients] = useState([])
  const [pendingPayments, setPendingPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'admin')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    const { data: subsData } = await supabase
      .from('subscriptions')
      .select('*')

    const { data: paymentsData } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('status', 'pending')

    const today = new Date()
    const in7Days = new Date()
    in7Days.setDate(in7Days.getDate() + 7)

    const expiring = []
    const expired = []

    subsData?.forEach(sub => {
      if (!sub.expiry_date) return
      const expiry = new Date(sub.expiry_date)
      const client = profilesData?.find(p => p.id === sub.user_id)
      if (!client) return

      if (expiry < today) {
        expired.push({ ...client, subscription: sub })
      } else if (expiry <= in7Days) {
        expiring.push({ ...client, subscription: sub })
      }
    })

    const totalClients = profilesData?.length || 0
    const pendingApprovals = profilesData?.filter(p => !p.approved).length || 0
    const activeSubscriptions = subsData?.filter(s => s.payment_status === 'paid' && new Date(s.expiry_date) >= today).length || 0
    const standardPlans = profilesData?.filter(p => p.plan_type === 'standard' && p.approved).length || 0
    const premiumPlans = profilesData?.filter(p => p.plan_type === 'premium' && p.approved).length || 0

    setExpiringSoonClients(expiring)
    setExpiredClients(expired)
    setPendingPayments(paymentsData?.filter(p => profilesData?.some(c => c.id === p.user_id)) || [])
    setStats({
      totalClients,
      pendingApprovals,
      activeSubscriptions,
      expiringSoon: expiring.length,
      expired: expired.length,
      // Matches current plan pricing (Standard: 20,000 RWF, Premium: 35,000 RWF).
      // Lifetime plans are a one-time payment, so they're excluded from a monthly estimate.
      estimatedRevenue: (standardPlans * 20000) + (premiumPlans * 35000),
    })
    setLoading(false)
  }

  const getDaysRemaining = (expiryDate) => {
    const today = new Date()
    const expiry = new Date(expiryDate)
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-gray-400 text-lg">Loading admin dashboard...</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">System overview and client management</p>
        </div>

        {/* Pending Payments Alert */}
        {pendingPayments.length > 0 && (
          <div
            onClick={() => navigate('/admin/subscriptions')}
            className="bg-yellow-900 border border-yellow-700 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-yellow-800 transition"
          >
            <p className="text-yellow-300 font-bold">
              {pendingPayments.length} payment{pendingPayments.length > 1 ? 's' : ''} waiting for verification
            </p>
            <span className="text-yellow-400 text-sm">View →</span>
          </div>
        )}

        {/* Pending Approvals Alert */}
        {stats.pendingApprovals > 0 && (
          <div
            onClick={() => navigate('/admin/clients')}
            className="bg-blue-900 border border-blue-700 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-blue-800 transition"
          >
            <p className="text-blue-300 font-bold">
              {stats.pendingApprovals} client{stats.pendingApprovals > 1 ? 's' : ''} waiting for approval
            </p>
            <span className="text-blue-400 text-sm">View →</span>
          </div>
        )}

        {/* Expiring Soon */}
        {expiringSoonClients.length > 0 && (
          <div className="bg-gray-900 border border-orange-700 rounded-xl p-6">
            <h2 className="text-lg font-bold text-orange-300 mb-4">Expiring Soon</h2>
            <div className="space-y-3">
              {expiringSoonClients.map((client) => (
                <div key={client.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-white font-medium">{client.full_name}</p>
                    <p className="text-gray-400 text-xs">{client.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        client.plan_type === 'premium' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'
                      }`}>
                        {client.plan_type === 'premium' ? 'Premium' : 'Standard'}
                      </span>
                      <p className="text-orange-400 text-xs mt-1 font-medium">
                        {getDaysRemaining(client.subscription.expiry_date)} days left
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedClient(client)}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expired Clients */}
        {expiredClients.length > 0 && (
          <div className="bg-gray-900 border border-red-700 rounded-xl p-6">
            <h2 className="text-lg font-bold text-red-300 mb-4">Expired Subscriptions</h2>
            <div className="space-y-3">
              {expiredClients.map((client) => (
                <div key={client.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-white font-medium">{client.full_name}</p>
                    <p className="text-gray-400 text-xs">{client.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        client.plan_type === 'premium' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'
                      }`}>
                        {client.plan_type === 'premium' ? 'Premium' : 'Standard'}
                      </span>
                      <p className="text-red-400 text-xs mt-1 font-medium">
                        Expired {new Date(client.subscription.expiry_date).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedClient(client)}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Client Detail Modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl max-h-full overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">Client Details</h2>
              <button onClick={() => setSelectedClient(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Name</span>
                <span className="text-white text-sm font-medium">{selectedClient.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Email</span>
                <span className="text-white text-sm">{selectedClient.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Plan</span>
                <span className="text-white text-sm font-medium">
                  {selectedClient.plan_type === 'premium' ? 'Premium' : 'Standard'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Account Status</span>
                <span className={`text-sm font-medium ${selectedClient.approved ? 'text-green-400' : 'text-yellow-400'}`}>
                  {selectedClient.approved ? 'Approved' : 'Pending'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Payment Status</span>
                <span className="text-white text-sm capitalize">{selectedClient.subscription?.payment_status || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Started</span>
                <span className="text-white text-sm">
                  {selectedClient.subscription?.start_date
                    ? new Date(selectedClient.subscription.start_date).toLocaleDateString()
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Expiry Date</span>
                <span className="text-white text-sm">
                  {selectedClient.subscription?.expiry_date
                    ? new Date(selectedClient.subscription.expiry_date).toLocaleDateString()
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Joined</span>
                <span className="text-white text-sm">{new Date(selectedClient.created_at).toLocaleDateString()}</span>
              </div>
              <button
                onClick={() => { navigate('/admin/clients'); setSelectedClient(null) }}
                className="w-full mt-3 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition"
              >
                Manage in Client Management →
              </button>
              <button
                onClick={() => setSelectedClient(null)}
                className="w-full py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
