import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

const STATUS_STYLE = {
  pending: 'bg-yellow-900 text-yellow-300',
  approved: 'bg-green-900 text-green-300',
  rejected: 'bg-red-900 text-red-300',
  cancelled: 'bg-surface text-gray-400',
}

const STATUS_LABEL = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Declined',
  cancelled: 'Cancelled',
}

const ENTITY_LABEL = {
  product: 'Product',
  sale: 'Sale',
  credit_given: 'Credit given',
  credit_taken: 'Credit taken',
  quotation: 'Quotation',
  expense: 'Expense',
}

// Reads what this person is allowed to see (the database limits it: approvers
// see the whole company, everyone else only their own requests)
async function fetchRequests(orgId, userId, isApprover) {
  const base = () => supabase.from('approval_requests').select('*').eq('organization_id', orgId)
  const mine = await base().eq('requested_by', userId).order('created_at', { ascending: false }).limit(50)
  if (!isApprover) return { pending: [], history: [], mine: mine.data || [] }
  const pending = await base().eq('status', 'pending').order('created_at', { ascending: true })
  const history = await base().neq('status', 'pending').order('created_at', { ascending: false }).limit(50)
  return { pending: pending.data || [], history: history.data || [], mine: mine.data || [] }
}

export default function Approvals() {
  const { user, organization, orgRole, canWrite, isCeo } = useAuth()
  const isApprover = canWrite('approvals')
  const [tab, setTab] = useState(isApprover ? 'pending' : 'mine')
  const [data, setData] = useState({ pending: [], history: [], mine: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const reload = () => setRefreshKey((k) => k + 1)

  const orgId = organization?.id
  const userId = user?.id

  useEffect(() => {
    if (!orgId || !userId) return
    let active = true
    fetchRequests(orgId, userId, isApprover).then((result) => {
      if (!active) return
      setData(result)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [orgId, userId, isApprover, refreshKey])

  const decide = async (request, status, decisionNote) => {
    setError('')
    setBusyId(request.id)
    const updates = { status }
    if (decisionNote) updates.decision_note = decisionNote
    const { error: updateError } = await supabase
      .from('approval_requests')
      .update(updates)
      .eq('id', request.id)
    setBusyId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setRejecting(null)
    setNote('')
    reload()
  }

  const handleCancelMine = async (request) => {
    setError('')
    setBusyId(request.id)
    const { error: updateError } = await supabase
      .from('approval_requests')
      .update({ status: 'cancelled' })
      .eq('id', request.id)
    setBusyId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    reload()
  }

  if (!orgRole || !organization) {
    return (
      <Layout>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white">Approvals</h1>
          <div className="mt-6 max-w-lg bg-surface-elevated border border-surface-border rounded-xl p-8 text-center">
            <p className="text-gray-300">Approvals are part of company accounts.</p>
          </div>
        </div>
      </Layout>
    )
  }

  const tabs = isApprover
    ? [
        { key: 'pending', label: `Waiting (${data.pending.length})` },
        { key: 'history', label: 'History' },
        { key: 'mine', label: 'My requests' },
      ]
    : [{ key: 'mine', label: 'My requests' }]

  const validity = (r) => {
    if (r.status !== 'approved') return null
    if (r.consumed_at) return 'Used'
    if (r.expires_at && new Date(r.expires_at) < new Date()) return 'Expired'
    return `Valid until ${new Date(r.expires_at).toLocaleString()}`
  }

  const RequestRow = ({ r, showActions, showMineActions }) => (
    <div className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          <span className="text-xs text-gray-500">{ENTITY_LABEL[r.entity_type] || r.entity_type}</span>
        </div>
        <p className="text-white text-sm font-medium mt-1">{r.summary}</p>
        <p className="text-gray-500 text-xs mt-1">
          {r.requester_name || 'Team member'} - {new Date(r.created_at).toLocaleString()}
        </p>
        {r.reason && <p className="text-gray-400 text-xs mt-1">Reason: {r.reason}</p>}
        {r.decision_note && <p className="text-gray-400 text-xs mt-1">Answer: {r.decision_note}</p>}
        {validity(r) && <p className="text-green-400 text-xs mt-1">{validity(r)}</p>}
        {r.status === 'approved' && !r.consumed_at && (r.requested_by === userId) && (
          <p className="text-gray-500 text-xs mt-1">Open the action again to use this approval.</p>
        )}
      </div>
      {showActions && (
        <div className="flex gap-2">
          {(isCeo || r.requested_by !== userId) && (
            <button
              onClick={() => decide(r, 'approved')}
              disabled={busyId === r.id}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition disabled:opacity-50"
            >
              Approve
            </button>
          )}
          <button
            onClick={() => { setRejecting(r); setNote('') }}
            disabled={busyId === r.id}
            className="px-4 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}
      {showMineActions && r.status === 'pending' && (
        <button
          onClick={() => handleCancelMine(r)}
          disabled={busyId === r.id}
          className="px-4 py-1.5 bg-surface border border-surface-border hover:border-primary text-white rounded-lg text-xs transition disabled:opacity-50"
        >
          Cancel request
        </button>
      )}
    </div>
  )

  const list = tab === 'pending' ? data.pending : tab === 'history' ? data.history : data.mine

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{isApprover ? 'Approvals' : 'My requests'}</h1>
            <p className="text-gray-400 text-sm mt-1">
              {isApprover
                ? 'Team members ask here before deleting or changing records.'
                : 'Requests you sent to the company owner.'}
            </p>
          </div>
          <button
            onClick={reload}
            className="px-4 py-2 bg-surface-elevated border border-surface-border hover:border-primary text-gray-300 rounded-lg text-sm transition"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 rounded-xl p-4 flex items-center justify-between">
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={() => setError('')} className="text-red-400 hover:text-white text-sm">✕</button>
          </div>
        )}

        {tabs.length > 1 && (
          <div className="flex gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tab === t.key ? 'bg-primary text-white' : 'bg-surface-elevated border border-surface-border text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-10">Loading...</p>
          ) : list.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-10">
              {tab === 'pending' ? 'Nothing is waiting for you.' : 'No requests yet.'}
            </p>
          ) : (
            <div className="divide-y divide-surface-border">
              {list.map((r) => (
                <RequestRow key={r.id} r={r} showActions={tab === 'pending'} showMineActions={tab === 'mine'} />
              ))}
            </div>
          )}
        </div>

        <p className="text-gray-500 text-xs">
          An approval can be used once and lasts 24 hours. After approving, the team member opens the same action again and it goes through.
        </p>
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-md mx-4 shadow-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-1">Decline request</h2>
            <p className="text-gray-400 text-sm mb-4">{rejecting.summary}</p>
            <label className="text-gray-400 text-xs block mb-1">Reason (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
              placeholder="Tell them why"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setRejecting(null)}
                className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition"
              >
                Back
              </button>
              <button
                onClick={() => decide(rejecting, 'rejected', note.trim())}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
              >
                Decline request
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
