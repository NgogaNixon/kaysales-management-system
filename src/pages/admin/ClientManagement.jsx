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
  const [actionError, setActionError] = useState('')

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
    setActionError('')
    const { error } = await supabase.from('profiles').update({ approved: true }).eq('id', userId)
    if (error) { setActionError('Could not approve this client: ' + error.message); return }
    fetchData()
  }

  const handleRevoke = async (userId) => {
    setActionError('')
    const { error } = await supabase.from('profiles').update({ approved: false }).eq('id', userId)
    if (error) { setActionError('Could not revoke this client: ' + error.message); return }
    fetchData()
  }

  // Moves the client to Trash — a single update, nothing deleted. Also blocks
  // their access by revoking approval. Restorable anytime from the Trash page.
  const handleTrashClient = async (userId) => {
    setActionError('')
    const { error } = await supabase
      .from('profiles')
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), approved: false })
      .eq('id', userId)
    if (error) {
      setActionError('Could not move this client to trash: ' + error.message)
      return
    }
    setShowDeleteConfirm(false)
    setClientToDelete(null)
    fetchData()
  }

  const handlePlanChange = async (userId, plan) => {
    setActionError('')
    const { error } = await supabase.from('profiles').update({ plan_type: plan }).eq('id', userId)
    if (error) { setActionError('Could not change plan: ' + error.message); return }

    // Keep the subscription record's plan in sync — otherwise a manual plan
    // change here silently falls out of sync with what Subscriptions.jsx shows.
    const { error: subError } = await supabase.from('subscriptions').update({ plan_type: plan }).eq('user_id', userId)
    if (subError) { setActionError('Plan updated, but the subscription record could not be synced: ' + subError.message); return }

    fetchData()
  }

  const handleToggleShowProfit = async (userId, currentValue) => {
    setActionError('')
    const { error } = await supabase.from('profiles').update({ show_profit: !currentValue }).eq('id', userId)
    if (error) { setActionError('Could not update profit view: ' + error.message); return }
    if (selectedClient?.id === userId) {
      setSelectedClient({ ...selectedClient, show_profit: !currentValue })
    }
    fetchData()
  }

  // A client counts as lifetime if the subscription is flagged lifetime OR its
  // plan is "lifetime" (same rule Subscriptions.jsx uses).
  const isLifetimeClient = (client) =>
    !!client?.subscription &&
    (client.subscription.plan_type === 'lifetime' || !!client.subscription.is_lifetime)

  // Default expiry when lifetime is switched off: 30 days from today, saved as
  // the END of that day (same as Subscriptions.jsx). The admin can change the
  // date afterwards from the Subscriptions page.
  const getDefaultExpiryIso = () => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    const pad = (n) => String(n).padStart(2, '0')
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    return new Date(dateStr + 'T23:59:59').toISOString()
  }

  // ON  -> subscription becomes lifetime, marked paid, expiry cleared.
  // OFF -> lifetime removed, plan goes back to standard/premium, marked paid,
  //        and a new expiry date (30 days from today) is inserted.
  const handleToggleLifetime = async (userId, currentValue) => {
    setActionError('')
    const client = clients.find(c => c.id === userId)
    const existingSub = client?.subscription
    const turningOn = !currentValue

    const restoredPlan =
      client?.plan_type && client.plan_type !== 'lifetime' ? client.plan_type : 'standard'

    const subUpdates = turningOn
      ? { is_lifetime: true, payment_status: 'paid', expiry_date: null }
      : { is_lifetime: false, plan_type: restoredPlan, payment_status: 'paid', expiry_date: getDefaultExpiryIso() }

    if (existingSub) {
      const { error } = await supabase.from('subscriptions').update(subUpdates).eq('user_id', userId)
      if (error) { setActionError('Could not update lifetime access: ' + error.message); return }
    } else if (turningOn) {
      // No subscription row yet — create one so the lifetime access is saved
      const { error } = await supabase.from('subscriptions').insert({
        user_id: userId,
        plan_type: client?.plan_type && client.plan_type !== 'lifetime' ? client.plan_type : 'standard',
        ...subUpdates,
      })
      if (error) { setActionError('Could not update lifetime access: ' + error.message); return }
    } else {
      return
    }

    // If the profile itself was saved as "lifetime", put it back to a normal plan
    let profilePlan = client?.plan_type
    if (!turningOn && client?.plan_type === 'lifetime') {
      const { error: profileError } = await supabase.from('profiles').update({ plan_type: restoredPlan }).eq('id', userId)
      if (profileError) { setActionError('Lifetime turned off, but the profile plan could not be updated: ' + profileError.message) }
      else profilePlan = restoredPlan
    }

    if (selectedClient?.id === userId) {
      setSelectedClient({
        ...selectedClient,
        plan_type: profilePlan,
        subscription: { ...(selectedClient.subscription || {}), ...subUpdates },
      })
    }
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
    if (isLifetimeClient(client)) return { label: 'Lifetime', color: 'bg-yellow-900 text-yellow-300' }
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
          <h1 className="text-2xl font-bold text-white">Client Management</h1>
          <p className="text-gray-400 text-sm mt-1">Manage client accounts and subscriptions</p>
        </div>

        {actionError && (
          <div className="bg-red-900 border border-red-700 rounded-xl p-4 flex items-center justify-between">
            <p className="text-red-300 text-sm">{actionError}</p>
            <button onClick={() => setActionError('')} className="text-red-400 hover:text-white text-sm">✕</button>
          </div>
        )}

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
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Profit View</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Lifetime</th>
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
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleShowProfit(client.id, client.show_profit)}
                            className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors focus:outline-none ${
                              client.show_profit ? 'bg-purple-600' : 'bg-gray-600'
                            }`}
                          >
                            <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                              client.show_profit ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </td>
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleLifetime(client.id, isLifetimeClient(client))}
                            className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors focus:outline-none ${
                              isLifetimeClient(client) ? 'bg-green-600' : 'bg-gray-600'
                            }`}
                          >
                            <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                              isLifetimeClient(client) ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            client.approved ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
                          }`}>
                            {client.approved ? 'Approved' : 'Pending'}
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
                          <div className="flex flex-col sm:flex-row gap-2" onClick={(e) => e.stopPropagation()}>
                            {!client.approved ? (
                              <button
                                onClick={() => handleApprove(client.id)}
                                className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition whitespace-nowrap"
                              >
                                Approve
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRevoke(client.id)}
                                className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-xs transition whitespace-nowrap"
                              >
                                Revoke
                              </button>
                            )}
                            <button
                              onClick={() => { setClientToDelete(client); setShowDeleteConfirm(true) }}
                              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition whitespace-nowrap"
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
                      {selectedClient.plan_type === 'premium' ? 'Premium' : 'Standard'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Profit View</span>
                    <button
                      onClick={() => handleToggleShowProfit(selectedClient.id, selectedClient.show_profit)}
                      className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors focus:outline-none ${
                        selectedClient.show_profit ? 'bg-purple-600' : 'bg-gray-600'
                      }`}
                    >
                      <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                        selectedClient.show_profit ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Lifetime Access</span>
                    <button
                      onClick={() => handleToggleLifetime(selectedClient.id, isLifetimeClient(selectedClient))}
                      className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors focus:outline-none ${
                        isLifetimeClient(selectedClient) ? 'bg-green-600' : 'bg-gray-600'
                      }`}
                    >
                      <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                        isLifetimeClient(selectedClient) ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Status</span>
                    <span className={`text-sm font-medium ${selectedClient.approved ? 'text-green-400' : 'text-yellow-400'}`}>
                      {selectedClient.approved ? 'Approved' : 'Pending'}
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
                        {isLifetimeClient(selectedClient)
                          ? 'Never expires'
                          : selectedClient.subscription.expiry_date
                          ? new Date(selectedClient.subscription.expiry_date).toLocaleDateString()
                          : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Days Remaining</span>
                      {isLifetimeClient(selectedClient) ? (
                        <span className="text-sm font-medium text-yellow-400">Lifetime</span>
                      ) : (
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
                      )}
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

      {/* Trash Confirmation */}
      {showDeleteConfirm && clientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 border border-red-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl p-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mt-3 mb-2">Move Client to Trash</h2>
              <p className="text-gray-400 text-sm mb-2">
                You are about to move <span className="text-white font-bold">{clientToDelete.full_name}</span> to Trash
              </p>
              <p className="text-gray-400 text-sm mb-6">
                Nothing is deleted — their products, sales, credits and subscription data stay intact. They'll lose access immediately, and you can restore them anytime from the Trash section.
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
                onClick={() => handleTrashClient(clientToDelete.id)}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}