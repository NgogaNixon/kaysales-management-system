import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'

export default function ClientManagement() {
  const [clients, setClients] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
const [clientToDelete, setClientToDelete] = useState(null)

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

    const { data: paymentsData } = await supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false })

    const clientsWithData = profilesData?.map(client => ({
      ...client,
      subscription: subsData?.find(s => s.user_id === client.id),
      payments: paymentsData?.filter(p => p.user_id === client.id),
    }))

    setClients(clientsWithData || [])
    setSubscriptions(subsData || [])
    setLoading(false)
  }

  const handleApprove = async (userId) => {
    await supabase.from('profiles').update({ approved: true }).eq('id', userId)
    fetchData()
  }

  const handleRevoke = async (userId) => {
    await supabase.from('profiles').update({ approved: false }).eq('id', userId)
    fetchData()
  }
  const handleDeleteClient = async (userId) => {
    // Delete all client data in order
    await supabase.from('sale_items').delete().eq('user_id', userId)
    await supabase.from('sales').delete().eq('user_id', userId)
    await supabase.from('products').delete().eq('user_id', userId)
    await supabase.from('credits_given').delete().eq('user_id', userId)
    await supabase.from('credits_taken').delete().eq('user_id', userId)
    await supabase.from('subscriptions').delete().eq('user_id', userId)
    await supabase.from('payment_requests').delete().eq('user_id', userId)
    await supabase.from('profiles').delete().eq('id', userId)
    setShowDeleteConfirm(false)
    setClientToDelete(null)
    fetchData()
  }

  const handlePlanChange = async (userId, plan) => {
    await supabase.from('profiles').update({ plan_type: plan }).eq('id', userId)
    fetchData()
  }

  const getDaysRemaining = (expiryDate) => {
    if (!expiryDate) return null
    const today = new Date()
    const expiry = new Date(expiryDate)
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
  }

  const getSubscriptionStatus = (client) => {
    if (!client.subscription) return { label: 'No Subscription', color: 'bg-gray-800 text-gray-400' }
    const days = getDaysRemaining(client.subscription.expiry_date)
    if (days === null) return { label: 'No Expiry Set', color: 'bg-gray-800 text-gray-400' }
    if (days <= 0) return { label: 'Expired', color: 'bg-red-900 text-red-300' }
    if (days <= 7) return { label: `${days} days left`, color: 'bg-orange-900 text-orange-300' }
    return { label: `${days} days left`, color: 'bg-green-900 text-green-300' }
  }

  const filtered = clients.filter(c => {
    const matchesFilter = filter === 'all' || (filter === 'approved' ? c.approved : !c.approved)
    const matchesSearch = c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">👥 Client Management</h1>
          <p className="text-gray-400 text-sm mt-1">Manage client accounts and subscriptions</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm flex-1 focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            {['all', 'pending', 'approved'].map((f) => (
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
        </div>

        {/* Clients Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading clients...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No clients found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Name</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Email</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Plan</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Subscription</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Joined</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => {
                    const subStatus = getSubscriptionStatus(client)
                    return (
                      <tr
                        key={client.id}
                        className="border-t border-gray-800 hover:bg-gray-800 transition cursor-pointer"
                        onClick={() => setSelectedClient(client)}
                      >
                        <td className="px-6 py-4 text-white font-medium">{client.full_name}</td>
                        <td className="px-6 py-4 text-gray-300">{client.email}</td>
                        <td className="px-6 py-4">
                          <select
                            value={client.plan_type || 'standard'}
                            onChange={(e) => { e.stopPropagation(); handlePlanChange(client.id, e.target.value) }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none"
                          >
                            <option value="standard">Standard</option>
                            <option value="premium">Premium</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            client.approved ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
                          }`}>
                            {client.approved ? '✅ Approved' : '⏳ Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${subStatus.color}`}>
                            {subStatus.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-400">
                          {new Date(client.created_at).toLocaleDateString()}
                        </td>
                       <td className="px-6 py-4">
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
                                className="px-3 py-1 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-xs transition"
                              >
                                Revoke
                              </button>
                            )}
                            <button
                              onClick={() => { setClientToDelete(client); setShowDeleteConfirm(true) }}
                              className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition"
                            >
                              Delete
                            </button>
                          </div>
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

      {/* Client Profile Modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">Client Profile</h2>
              <button onClick={() => setSelectedClient(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">

              {/* Basic Info */}
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Account Info</h3>
                <div className="space-y-2">
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
                    <span className={`text-sm font-medium ${selectedClient.plan_type === 'premium' ? 'text-purple-400' : 'text-blue-400'}`}>
                      {selectedClient.plan_type === 'premium' ? '⭐ Premium' : '📦 Standard'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Status</span>
                    <span className={`text-sm font-medium ${selectedClient.approved ? 'text-green-400' : 'text-yellow-400'}`}>
                      {selectedClient.approved ? '✅ Approved' : '⏳ Pending'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Joined</span>
                    <span className="text-white text-sm">{new Date(selectedClient.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Subscription Info */}
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Subscription</h3>
                {selectedClient.subscription ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Payment Status</span>
                      <span className={`text-sm font-medium ${
                        selectedClient.subscription.payment_status === 'paid' ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        {selectedClient.subscription.payment_status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Start Date</span>
                      <span className="text-white text-sm">
                        {new Date(selectedClient.subscription.start_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Expiry Date</span>
                      <span className="text-white text-sm">
                        {selectedClient.subscription.expiry_date
                          ? new Date(selectedClient.subscription.expiry_date).toLocaleDateString()
                          : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Days Remaining</span>
                      <span className={`text-sm font-medium ${
                        getDaysRemaining(selectedClient.subscription.expiry_date) <= 0
                          ? 'text-red-400'
                          : getDaysRemaining(selectedClient.subscription.expiry_date) <= 7
                          ? 'text-orange-400'
                          : 'text-green-400'
                      }`}>
                        {getDaysRemaining(selectedClient.subscription.expiry_date) <= 0
                          ? 'Expired'
                          : `${getDaysRemaining(selectedClient.subscription.expiry_date)} days`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No subscription found</p>
                )}
              </div>

              {/* Payment History */}
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Payment History</h3>
                {selectedClient.payments?.length === 0 ? (
                  <p className="text-gray-500 text-sm">No payment history</p>
                ) : (
                  <div className="space-y-2">
                    {selectedClient.payments?.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between py-2 border-b border-gray-700">
                        <div>
                          <p className="text-white text-sm">RWF {payment.amount?.toLocaleString()}</p>
                          <p className="text-gray-500 text-xs">{payment.transaction_id}</p>
                          <p className="text-gray-500 text-xs">{new Date(payment.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          payment.status === 'approved'
                            ? 'bg-green-900 text-green-300'
                            : payment.status === 'rejected'
                            ? 'bg-red-900 text-red-300'
                            : 'bg-yellow-900 text-yellow-300'
                        }`}>
                          {payment.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
{/* Delete Client Confirmation */}
      {showDeleteConfirm && clientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 border border-red-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl p-6">
            <div className="text-center">
              <span className="text-4xl">⚠️</span>
              <h2 className="text-xl font-bold text-white mt-3 mb-2">Delete Client Account</h2>
              <p className="text-gray-400 text-sm mb-2">
                You are about to permanently delete <span className="text-white font-bold">{clientToDelete.full_name}</span>
              </p>
              <p className="text-red-400 text-sm mb-6">
                This will delete all their products, sales, credits and subscription data. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setClientToDelete(null) }}
                className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteClient(clientToDelete.id)}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
    
  )
}