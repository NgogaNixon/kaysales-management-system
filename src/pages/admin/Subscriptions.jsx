import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState([])
  const [clients, setClients] = useState([])
  const [paymentRequests, setPaymentRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('payments')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ user_id: '', plan_type: 'standard', expiry_days: '30' })
  const [addSaving, setAddSaving] = useState(false)
  const [extendDays, setExtendDays] = useState({})

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

    const { data: paymentsData } = await supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false })

    setClients(profilesData || [])
    setSubscriptions(subsData || [])
    setPaymentRequests(paymentsData || [])
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

  const handleApprovePayment = async (payment) => {
    // Update payment request status
    await supabase
      .from('payment_requests')
      .update({ status: 'approved' })
      .eq('id', payment.id)

    // Approve client profile
    await supabase
      .from('profiles')
      .update({ approved: true, plan_type: payment.plan_type })
      .eq('id', payment.user_id)

    // Set expiry date to 30 days from now
    const expiryDate = new Date()
    const isTrial = payment.transaction_id === 'FREE-TRIAL'
    expiryDate.setDate(expiryDate.getDate() + (isTrial ? 7 : 30))
    // Check if subscription exists
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', payment.user_id)
      .single()

    if (existingSub) {
      await supabase
        .from('subscriptions')
        .update({
          plan_type: payment.plan_type,
          payment_status: 'paid',
          expiry_date: expiryDate.toISOString(),
        })
        .eq('user_id', payment.user_id)
    } else {
      await supabase
        .from('subscriptions')
        .insert({
          user_id: payment.user_id,
          plan_type: payment.plan_type,
          payment_status: 'paid',
          expiry_date: expiryDate.toISOString(),
        })
    }

    fetchData()
  }

  const handleRejectPayment = async (paymentId) => {
    await supabase
      .from('payment_requests')
      .update({ status: 'rejected' })
      .eq('id', paymentId)
    fetchData()
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

  const handleExtendSubscription = async (sub, days) => {
    if (!days || parseInt(days) < 1) return
    const currentExpiry = sub.expiry_date ? new Date(sub.expiry_date) : new Date()
    const newExpiry = new Date(currentExpiry)
    newExpiry.setDate(newExpiry.getDate() + parseInt(days))
    await supabase
      .from('subscriptions')
      .update({
        expiry_date: newExpiry.toISOString(),
        payment_status: 'paid',
      })
      .eq('id', sub.id)
    fetchData()
  }

  const handleAddSubscription = async () => {
    if (!addForm.user_id) return
    setAddSaving(true)

    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + parseInt(addForm.expiry_days || 30))

    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', addForm.user_id)
      .maybeSingle()

    if (existingSub) {
      await supabase
        .from('subscriptions')
        .update({
          plan_type: addForm.plan_type,
          payment_status: 'paid',
          expiry_date: expiryDate.toISOString(),
        })
        .eq('user_id', addForm.user_id)
    } else {
      await supabase
        .from('subscriptions')
        .insert({
          user_id: addForm.user_id,
          plan_type: addForm.plan_type,
          payment_status: 'paid',
          expiry_date: expiryDate.toISOString(),
        })
    }

    await supabase
      .from('profiles')
      .update({ approved: true, plan_type: addForm.plan_type })
      .eq('id', addForm.user_id)

    setAddSaving(false)
    setShowAddModal(false)
    setAddForm({ user_id: '', plan_type: 'standard', expiry_days: '30' })
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

  const pendingPayments = paymentRequests.filter(p => p.status === 'pending')

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">💳 Subscriptions</h1>
            <p className="text-gray-400 text-sm mt-1">Manage payments and subscriptions</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
          >
            + Add Subscription
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Payment Requests', value: pendingPayments.length, icon: '⏳' },
            { label: 'Active Subs', value: subscriptions.filter(s => s.payment_status === 'paid').length, icon: '✅' },
            { label: 'Pending Subs', value: subscriptions.filter(s => s.payment_status === 'pending').length, icon: '🔄' },
            { label: 'Expiring Soon', value: subscriptions.filter(s => { const d = getDaysRemaining(s.expiry_date); return d !== null && d <= 7 }).length, icon: '⚠️' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-2xl font-bold text-white mt-2">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Pending Payment Alert */}
        {pendingPayments.length > 0 && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <p className="text-yellow-300 font-bold">
              {pendingPayments.length} payment{pendingPayments.length > 1 ? 's' : ''} waiting for verification
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'payments'
                ? 'bg-yellow-500 text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            💰 Payment Requests ({pendingPayments.length})
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'subscriptions'
                ? 'bg-yellow-500 text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            📋 All Subscriptions
          </button>
        </div>

        {/* Payment Requests Tab */}
        {activeTab === 'payments' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-400">Loading...</p>
              </div>
            ) : paymentRequests.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No payment requests yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Client</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Plan</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Amount</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Sender Name</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Transaction ID</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Date</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRequests.map((payment) => (
                      <tr key={payment.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                        <td className="px-6 py-4">
                          <p className="text-white font-medium">{getClientName(payment.user_id)}</p>
                          <p className="text-gray-500 text-xs">{getClientEmail(payment.user_id)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            payment.plan_type === 'premium'
                              ? 'bg-purple-900 text-purple-300'
                              : 'bg-blue-900 text-blue-300'
                          }`}>
                            {payment.plan_type === 'premium' ? '⭐ Premium' : '📦 Standard'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {payment.amount === 0
                            ? <span className="text-green-400">FREE TRIAL</span>
                            : <span className="text-green-400">RWF {payment.amount?.toLocaleString()}</span>
                          }
                        </td>
                        <td className="px-6 py-4 text-gray-300">{payment.sender_name}</td>
                       <td className="px-6 py-4 font-mono">
                          {payment.transaction_id === 'FREE-TRIAL'
                            ? <span className="text-green-400 bg-green-900 px-2 py-1 rounded text-xs">7-Day Trial</span>
                            : <span className="text-gray-300">{payment.transaction_id}</span>
                          }
                        </td>
                        <td className="px-6 py-4 text-gray-400">
                          {new Date(payment.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            payment.status === 'approved'
                              ? 'bg-green-900 text-green-300'
                              : payment.status === 'rejected'
                              ? 'bg-red-900 text-red-300'
                              : 'bg-yellow-900 text-yellow-300'
                          }`}>
                            {payment.status === 'approved' ? '✅ Approved' : payment.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {payment.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApprovePayment(payment)}
                                className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectPayment(payment.id)}
                                className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

            {/* Filters */}
            <div className="p-4 border-b border-gray-800 flex gap-2">
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

            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-400">Loading...</p>
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
                              sub.plan_type === 'premium'
                                ? 'bg-purple-900 text-purple-300'
                                : 'bg-blue-900 text-blue-300'
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
                          <td className="px-6 py-4 space-y-2">
                            <input
                              type="date"
                              value={sub.expiry_date ? sub.expiry_date.split('T')[0] : ''}
                              onChange={(e) => handleExpiryChange(sub.id, e.target.value)}
                              className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none w-full"
                            />
                            <div className="flex gap-1">
                              <input
                                type="number"
                                value={extendDays[sub.id] || ''}
                                onChange={(e) => setExtendDays({ ...extendDays, [sub.id]: e.target.value })}
                                className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none w-16"
                                placeholder="Days"
                                min="1"
                              />
                              <button
                                onClick={() => {
                                  handleExtendSubscription(sub, extendDays[sub.id])
                                  setExtendDays({ ...extendDays, [sub.id]: '' })
                                }}
                                disabled={!extendDays[sub.id]}
                                className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs transition disabled:opacity-50"
                              >
                                + Extend
                              </button>
                            </div>
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
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    {/* Add Subscription Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">+ Add Subscription</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Select Client *</label>
                <select
                  value={addForm.user_id}
                  onChange={(e) => setAddForm({ ...addForm, user_id: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Choose a client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name} — {c.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Plan</label>
                <select
                  value={addForm.plan_type}
                  onChange={(e) => setAddForm({ ...addForm, plan_type: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="standard">📦 Standard</option>
                  <option value="premium">⭐ Premium</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Duration (days)</label>
                <input
                  type="number"
                  value={addForm.expiry_days}
                  onChange={(e) => setAddForm({ ...addForm, expiry_days: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  placeholder="30"
                  min="1"
                />
                <p className="text-gray-500 text-xs mt-1">
                  Expires on: {new Date(Date.now() + (parseInt(addForm.expiry_days) || 30) * 86400000).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">
                  Cancel
                </button>
                <button
                  onClick={handleAddSubscription}
                  disabled={addSaving || !addForm.user_id}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
                >
                  {addSaving ? 'Saving...' : 'Add Subscription'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}