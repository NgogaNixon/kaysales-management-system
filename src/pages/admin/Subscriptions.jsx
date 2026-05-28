import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState([])
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

    const { data: subsData } = await supabase
      .from('subscriptions')
      .select('*')

    setClients(profilesData || [])
    setSubscriptions(subsData || [])
    setLoading(false)
  }

  const getClientName = (userId) => {
    const client = clients.find(c => c.id === userId)
    return client?.full_name || 'Unknown'
  }

  const getClientEmail = (userId) => {
    const client = clients.find(c => c.id === userId)
    return client?.email || ''
  }

  const getDaysRemaining = (expiryDate) => {
    if (!expiryDate) return null
    const today = new Date()
    const expiry = new Date(expiryDate)
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
  }

  const handleStatusChange = async (subId, status) => {
    await supabase
      .from('subscriptions')
      .update({ payment_status: status })
      .eq('id', subId)
    fetchData()
  }

  const handleExpiryChange = async (subId, date) => {
    await supabase
      .from('subscriptions')
      .update({ expiry_date: date })
      .eq('id', subId)
    fetchData()
  }

  const filtered = subscriptions.filter(s => {
    if (filter === 'paid') return s.payment_status === 'paid'
    if (filter === 'pending') return s.payment_status === 'pending'
    if (filter === 'expiring') {
      const days = getDaysRemaining(s.expiry_date)
      return days !== null && days <= 7
    }
    return true
  })

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">💳 Subscriptions</h1>
          <p className="text-gray-400 text-sm mt-1">Manage client subscription plans and payment status</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: subscriptions.length, icon: '📋' },
            { label: 'Paid', value: subscriptions.filter(s => s.payment_status === 'paid').length, icon: '✅' },
            { label: 'Pending', value: subscriptions.filter(s => s.payment_status === 'pending').length, icon: '⏳' },
            { label: 'Expiring Soon', value: subscriptions.filter(s => { const d = getDaysRemaining(s.expiry_date); return d !== null && d <= 7 }).length, icon: '⚠️' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-2xl font-bold text-white mt-2">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {['all', 'paid', 'pending', 'expiring'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === f ? 'bg-yellow-500 text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Subscriptions Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading subscriptions...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No subscriptions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Client</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Plan</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Expiry Date</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Days Left</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sub) => {
                    const days = getDaysRemaining(sub.expiry_date)
                    return (
                      <tr key={sub.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                        <td className="px-6 py-4">
                          <p className="text-white font-medium">{getClientName(sub.user_id)}</p>
                          <p className="text-gray-500 text-xs">{getClientEmail(sub.user_id)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            sub.plan_type === 'premium' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'
                          }`}>
                            {sub.plan_type === 'premium' ? '⭐ Premium' : '📦 Standard'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={sub.payment_status}
                            onChange={(e) => handleStatusChange(sub.id, e.target.value)}
                            className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none"
                          >
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="expired">Expired</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="date"
                            value={sub.expiry_date ? sub.expiry_date.split('T')[0] : ''}
                            onChange={(e) => handleExpiryChange(sub.id, e.target.value)}
                            className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none"
                          />
                        </td>
                        <td className="px-6 py-4">
                          {days === null ? (
                            <span className="text-gray-500 text-xs">No expiry set</span>
                          ) : (
                            <span className={`text-xs font-medium ${
                              days <= 0 ? 'text-red-400' : days <= 7 ? 'text-yellow-400' : 'text-green-400'
                            }`}>
                              {days <= 0 ? 'Expired' : `${days} days`}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-500 text-xs">
                            {new Date(sub.start_date).toLocaleDateString()}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </Layout>
  )
}