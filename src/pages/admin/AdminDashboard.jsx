import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Layout from '../../components/Layout'

export default function AdminDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({
    totalClients: 0,
    pendingApprovals: 0,
    activeSubscriptions: 0,
    totalRevenue: 0,
  })
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'admin')
      .order('created_at', { ascending: false })

    const { data: subsData } = await supabase
      .from('subscriptions')
      .select('*')

    const totalClients = profilesData?.length || 0
    const pendingApprovals = profilesData?.filter(p => !p.approved).length || 0
    const activeSubscriptions = subsData?.filter(s => s.payment_status === 'paid').length || 0

    setClients(profilesData || [])
    setStats({
      totalClients,
      pendingApprovals,
      activeSubscriptions,
      totalRevenue: activeSubscriptions * 50000,
    })
    setLoading(false)
  }

  const handleApprove = async (userId) => {
    await supabase
      .from('profiles')
      .update({ approved: true })
      .eq('id', userId)
    fetchData()
  }

  const handleRevoke = async (userId) => {
    await supabase
      .from('profiles')
      .update({ approved: false })
      .eq('id', userId)
    fetchData()
  }

  const handlePlanChange = async (userId, plan) => {
    await supabase
      .from('profiles')
      .update({ plan_type: plan })
      .eq('id', userId)
    fetchData()
  }

  const filteredClients = clients.filter(c => {
    if (filter === 'pending') return !c.approved
    if (filter === 'approved') return c.approved
    return true
  })

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
          <h1 className="text-2xl font-bold text-white">
            Admin Dashboard 👑
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage clients, subscriptions and system overview
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Clients', value: stats.totalClients, icon: '👥', color: 'blue' },
            { label: 'Pending Approvals', value: stats.pendingApprovals, icon: '⏳', color: 'yellow' },
            { label: 'Active Subscriptions', value: stats.activeSubscriptions, icon: '✅', color: 'green' },
            { label: 'Est. Monthly Revenue', value: `RWF ${stats.totalRevenue.toLocaleString()}`, icon: '💰', color: 'purple' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-2xl font-bold text-white mt-2">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Pending Approvals Alert */}
        {stats.pendingApprovals > 0 && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">⏳</span>
            <p className="text-yellow-300 font-bold">
              {stats.pendingApprovals} client{stats.pendingApprovals > 1 ? 's' : ''} waiting for approval
            </p>
          </div>
        )}

        {/* Clients Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">All Clients</h2>
            <div className="flex gap-2">
              {['all', 'pending', 'approved'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                    filter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filteredClients.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No clients found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-400 pb-3 font-medium">Name</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Email</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Plan</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Status</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Joined</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <tr key={client.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                      <td className="py-3 text-white font-medium">{client.full_name}</td>
                      <td className="py-3 text-gray-300">{client.email}</td>
                      <td className="py-3">
                        <select
                          value={client.plan_type || 'standard'}
                          onChange={(e) => handlePlanChange(client.id, e.target.value)}
                          className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700"
                        >
                          <option value="standard">Standard</option>
                          <option value="premium">Premium</option>
                        </select>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          client.approved
                            ? 'bg-green-900 text-green-300'
                            : 'bg-yellow-900 text-yellow-300'
                        }`}>
                          {client.approved ? '✅ Approved' : '⏳ Pending'}
                        </span>
                      </td>
                      <td className="py-3 text-gray-400">
                        {new Date(client.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          {!client.approved ? (
                            <button
                              onClick={() => handleApprove(client.id)}
                              className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition"
                            >
                              Approve
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRevoke(client.id)}
                              className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </Layout>
  )
}