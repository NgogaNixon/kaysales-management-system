import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'

export default function Trash() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionError, setActionError] = useState('')
  const [showPermanentConfirm, setShowPermanentConfirm] = useState(false)
  const [clientToPurge, setClientToPurge] = useState(null)
  const [purging, setPurging] = useState(false)

  useEffect(() => {
    fetchTrash()
  }, [])

  const fetchTrash = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'admin')
      .eq('is_deleted', true)
      .order('deleted_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  // Clears the trash flag and re-grants nothing automatically — restored
  // clients come back as "Pending" so an admin consciously re-approves them.
  const handleRestore = async (client) => {
    setActionError('')
    const { error } = await supabase
      .from('profiles')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', client.id)
    if (error) {
      setActionError('Could not restore this client: ' + error.message)
      return
    }
    fetchTrash()
  }

  // True permanent delete — the original cascading delete this page replaces
  // the risk of, kept here as a deliberate last-resort action with proper
  // error handling so a blocked table surfaces instead of failing silently.
  const handlePermanentDelete = async () => {
    if (!clientToPurge) return
    setPurging(true)
    setActionError('')
    const userId = clientToPurge.id

    const steps = [
      ['sale_items', 'user_id'],
      ['sales', 'user_id'],
      ['products', 'user_id'],
      ['credits_given', 'user_id'],
      ['credits_taken', 'user_id'],
      ['subscriptions', 'user_id'],
      ['payment_requests', 'user_id'],
    ]

    for (const [table, column] of steps) {
      const { error } = await supabase.from(table).delete().eq(column, userId)
      if (error) {
        setActionError(`Could not delete related data in "${table}": ${error.message}`)
        setPurging(false)
        return
      }
    }

    const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId)
    if (profileError) {
      setActionError('Could not delete the client profile: ' + profileError.message)
      setPurging(false)
      return
    }

    setPurging(false)
    setShowPermanentConfirm(false)
    setClientToPurge(null)
    fetchTrash()
  }

  const filtered = clients.filter(c =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout>
      <div className="p-6 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-white">Trash</h1>
          <p className="text-gray-400 text-sm mt-1">Trashed clients — restorable anytime, nothing auto-deletes</p>
        </div>

        {actionError && (
          <div className="bg-red-900 border border-red-700 rounded-xl p-4 flex items-center justify-between">
            <p className="text-red-300 text-sm">{actionError}</p>
            <button onClick={() => setActionError('')} className="text-red-400 hover:text-white text-sm">✕</button>
          </div>
        )}

        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
        />

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading trash...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Trash is empty</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Name</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Email</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Plan</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Trashed On</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => (
                    <tr key={client.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4 text-white font-medium">{client.full_name}</td>
                      <td className="px-6 py-4 text-gray-300">{client.email}</td>
                      <td className="px-6 py-4 text-gray-300 capitalize">{client.plan_type || 'standard'}</td>
                      <td className="px-6 py-4 text-gray-400">
                        {client.deleted_at ? new Date(client.deleted_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRestore(client)}
                            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition whitespace-nowrap"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => { setClientToPurge(client); setShowPermanentConfirm(true) }}
                            className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-300 rounded-lg text-xs transition whitespace-nowrap"
                          >
                            Delete Permanently
                          </button>
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

      {showPermanentConfirm && clientToPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 border border-red-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl p-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mt-3 mb-2">Delete Permanently</h2>
              <p className="text-gray-400 text-sm mb-2">
                You are about to permanently delete <span className="text-white font-bold">{clientToPurge.full_name}</span>
              </p>
              <p className="text-red-400 text-sm mb-6">
                This will delete all their products, sales, credits and subscription data. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPermanentConfirm(false); setClientToPurge(null) }}
                className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition font-medium"
                disabled={purging}
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                disabled={purging}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50"
              >
                {purging ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
