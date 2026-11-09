import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'
import { PLANS } from '../../lib/planConfig'
import { ROLE_LABELS } from '../../lib/permissions'
import { approvePaymentRequest, ensureCompany } from '../../lib/approvePayment'
import { localDate } from '../../lib/dates'

const DEFAULT_SEATS = PLANS.organization.limits.maxSeats

// Everything the page shows: companies with their owners and teams, and the
// company requests that are waiting for the admin
async function fetchCompanies() {
  const { data: orgRows } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })

  const orgs = orgRows || []
  const ownerIds = orgs.map((o) => o.owner_id)

  const { data: memberRows } = await supabase.from('organization_members').select('*')
  const members = memberRows || []
  const { data: inviteRows } = await supabase
    .from('organization_invites')
    .select('organization_id')
    .eq('status', 'pending')
  const invites = inviteRows || []

  const profileIds = [...new Set([...ownerIds, ...members.map((m) => m.user_id)])]
  let profiles = []
  if (profileIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, full_name, email, plan_type').in('id', profileIds)
    profiles = data || []
  }
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))

  const allCompanies = orgs.map((o) => ({
    ...o,
    owner: profileMap[o.owner_id] || null,
    members: members
      .filter((m) => m.organization_id === o.id)
      .map((m) => ({ ...m, profile: profileMap[m.user_id] || null })),
    pendingInvites: invites.filter((i) => i.organization_id === o.id).length,
  }))

  // A company is listed only while its owner is on the Organization plan.
  // If the owner moves to another plan, it leaves this list (nothing is deleted).
  const companies = allCompanies.filter((c) => c.owner?.plan_type === 'organization')
  const listedOwnerIds = companies.map((c) => c.owner_id)

  // Clients who asked for the company feature and do not have a company yet
  const { data: requestRows } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('plan_type', 'organization')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const requestUserIds = [...new Set((requestRows || []).map((r) => r.user_id))]
  let requestProfiles = []
  if (requestUserIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_name, company_phone, company_location, company_tin')
      .eq('is_deleted', false)
      .in('id', requestUserIds)
    requestProfiles = data || []
  }

  // One request per client (the newest one), only for clients without a company
  const requests = []
  ;(requestRows || []).forEach((r) => {
    const alreadyListed = requests.some((x) => x.user_id === r.user_id)
    const hasCompany = listedOwnerIds.includes(r.user_id)
    const profile = requestProfiles.find((p) => p.id === r.user_id)
    if (!alreadyListed && !hasCompany && profile) {
      requests.push({ ...r, profile })
    }
  })

  // Approved Organization clients that still have no company (for example approved before the company was set up automatically)
  const memberIds = members.map((m) => m.user_id)
  const { data: orgClientRows } = await supabase
    .from('profiles')
    .select('id, full_name, email, company_name, company_phone, company_location, company_tin')
    .eq('plan_type', 'organization')
    .eq('approved', true)
    .eq('is_deleted', false)
    .neq('role', 'admin')
  const setups = (orgClientRows || []).filter(
    (p) => !ownerIds.includes(p.id) && !memberIds.includes(p.id) && !requests.some((r) => r.user_id === p.id)
  )

  return { companies, requests, setups }
}

export default function Organizations() {
  const [companies, setCompanies] = useState([])
  const [requests, setRequests] = useState([])
  const [setups, setSetups] = useState([])
  const [settingUpId, setSettingUpId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expiryDates, setExpiryDates] = useState({})
  const [acceptingId, setAcceptingId] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [seatEdits, setSeatEdits] = useState({})
  const [refreshKey, setRefreshKey] = useState(0)
  const reload = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    let active = true
    fetchCompanies().then((result) => {
      if (!active) return
      setCompanies(result.companies)
      setRequests(result.requests)
      setSetups(result.setups)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshKey])

  // Default expiry for a new company: 30 days from today
  const getDefaultExpiry = () => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return localDate(d)
  }

  // Switching the toggle on accepts the request and creates the company
  const handleAccept = async (request) => {
    setError('')
    setNotice('')
    setAcceptingId(request.id)

    const chosenDate = expiryDates[request.id] || getDefaultExpiry()
    const companyName = (request.profile.company_name || '').trim() || request.profile.full_name

    const message = await approvePaymentRequest(request, chosenDate, companyName)
    setAcceptingId(null)

    if (message) {
      setError(message)
    } else {
      setNotice(`Company "${companyName}" accepted. The client can now use the company features.`)
    }
    reload()
  }

  // Creates the company for an approved Organization client that has none yet
  const handleSetup = async (client) => {
    setError('')
    setNotice('')
    setSettingUpId(client.id)
    const companyName = (client.company_name || '').trim() || client.full_name
    const message = await ensureCompany(client.id, companyName)
    setSettingUpId(null)
    if (message) {
      setError(message)
    } else {
      setNotice(`Company "${companyName}" is ready. The client can now use the company features.`)
    }
    reload()
  }

  const handleReject = async (request) => {
    setError('')
    setNotice('')
    const { error: updateError } = await supabase
      .from('payment_requests')
      .update({ status: 'rejected' })
      .eq('id', request.id)
    if (updateError) { setError('Could not reject the request: ' + updateError.message); return }
    reload()
  }

  const handleToggleStatus = async (company) => {
    setError('')
    const next = company.status === 'active' ? 'suspended' : 'active'
    const { error: updateError } = await supabase.from('organizations').update({ status: next }).eq('id', company.id)
    if (updateError) { setError('Could not update the company: ' + updateError.message); return }
    reload()
  }

  const handleSaveSeats = async (company) => {
    setError('')
    const raw = seatEdits[company.id]
    const seats = raw === '' || raw === undefined ? null : parseInt(raw, 10)
    if (seats !== null && (Number.isNaN(seats) || seats < 1)) { setError('Team size must be a number of 1 or more.'); return }
    const { error: updateError } = await supabase.from('organizations').update({ seat_limit: seats }).eq('id', company.id)
    if (updateError) { setError('Could not save the team size: ' + updateError.message); return }
    setSeatEdits((prev) => {
      const next = { ...prev }
      delete next[company.id]
      return next
    })
    reload()
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-white">Companies</h1>
          <p className="text-gray-400 text-sm mt-1">Organization accounts: a company owner with a team</p>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 rounded-xl p-4 flex items-center justify-between">
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={() => setError('')} className="text-red-400 hover:text-white text-sm">✕</button>
          </div>
        )}
        {notice && (
          <div className="bg-green-900 border border-green-700 rounded-xl p-4 flex items-center justify-between">
            <p className="text-green-300 text-sm">{notice}</p>
            <button onClick={() => setNotice('')} className="text-green-400 hover:text-white text-sm">✕</button>
          </div>
        )}

        {/* Company requests */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-1">Company requests</h2>
          <p className="text-gray-400 text-sm mb-4">
            Clients who asked for the company feature and entered their company details. Switch the toggle on to accept the request and turn on team accounts for them.
          </p>
          {loading ? (
            <p className="text-gray-400 text-sm">Loading requests...</p>
          ) : requests.length === 0 ? (
            <p className="text-gray-500 text-sm">No company requests waiting.</p>
          ) : (
            <div className="divide-y divide-surface-border">
              {requests.map((r) => (
                <div key={r.id} className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="text-white font-medium">{r.profile.company_name || 'No company name entered'}</p>
                    <p className="text-gray-400 text-xs">Owner: {r.profile.full_name} - {r.profile.email}</p>
                    <p className="text-gray-500 text-xs">
                      {[r.profile.company_phone, r.profile.company_location, r.profile.company_tin ? `TIN: ${r.profile.company_tin}` : '']
                        .filter(Boolean)
                        .join(' | ')}
                    </p>
                    <p className="text-gray-500 text-xs">
                      Paid RWF {r.amount?.toLocaleString()} - transaction {r.transaction_id} - sent by {r.sender_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="text-gray-500 text-xs block mb-1">Expiry date</label>
                      <input
                        type="date"
                        value={expiryDates[r.id] ?? getDefaultExpiry()}
                        onChange={(e) => setExpiryDates((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        className="bg-surface border border-surface-border text-white px-2 py-1 rounded-lg text-xs focus:outline-none focus:border-admin-light"
                      />
                    </div>
                    <div className="text-center">
                      <label className="text-gray-500 text-xs block mb-1">Accept</label>
                      <button
                        onClick={() => handleAccept(r)}
                        disabled={acceptingId === r.id}
                        className={`relative w-12 h-6 rounded-full transition ${acceptingId === r.id ? 'bg-green-600' : 'bg-gray-600'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${acceptingId === r.id ? 'left-6' : 'left-0.5'}`}></span>
                      </button>
                    </div>
                    <button
                      onClick={() => handleReject(r)}
                      className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {setups.length > 0 && (
            <div className="mt-6 pt-4 border-t border-surface-border">
              <h3 className="text-white font-bold text-sm mb-1">Approved clients waiting for their company</h3>
              <p className="text-gray-400 text-xs mb-3">These clients are on the Organization plan but have no company yet. Switch the toggle on to set it up.</p>
              <div className="divide-y divide-surface-border">
                {setups.map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-white font-medium">{c.company_name || 'No company name entered'}</p>
                      <p className="text-gray-400 text-xs">Owner: {c.full_name} - {c.email}</p>
                    </div>
                    <button
                      onClick={() => handleSetup(c)}
                      disabled={settingUpId === c.id}
                      className={`relative w-12 h-6 rounded-full transition ${settingUpId === c.id ? 'bg-green-600' : 'bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${settingUpId === c.id ? 'left-6' : 'left-0.5'}`}></span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Companies */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-10">Loading companies...</p>
          ) : companies.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-10">No companies yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Company</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Owner</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Plan</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Team</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => {
                    const limit = c.seat_limit ?? DEFAULT_SEATS
                    const used = c.members.length + c.pendingInvites
                    const editing = seatEdits[c.id] !== undefined
                    return (
                      <tr key={c.id} className="border-t border-surface-border">
                        <td className="px-6 py-4">
                          <p className="text-white font-medium">{c.name}</p>
                          <p className="text-gray-500 text-xs">Created {new Date(c.created_at).toLocaleDateString()}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-white">{c.owner?.full_name || 'Unknown'}</p>
                          <p className="text-gray-500 text-xs">{c.owner?.email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-900 text-emerald-300">
                            {PLANS[c.owner?.plan_type]?.name || 'Standard'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-white">{c.members.length} members{c.pendingInvites > 0 ? `, ${c.pendingInvites} invited` : ''}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-gray-500 text-xs">Limit</span>
                            <input
                              type="number"
                              min="1"
                              value={editing ? seatEdits[c.id] : (c.seat_limit ?? '')}
                              placeholder={String(DEFAULT_SEATS)}
                              onChange={(e) => setSeatEdits((prev) => ({ ...prev, [c.id]: e.target.value }))}
                              className="w-16 bg-surface border border-surface-border text-white px-2 py-1 rounded text-xs focus:outline-none focus:border-admin-light"
                            />
                            {editing && (
                              <button onClick={() => handleSaveSeats(c)} className="px-2 py-1 bg-admin hover:bg-admin-light text-white rounded text-xs transition">Save</button>
                            )}
                          </div>
                          {used >= limit && <p className="text-yellow-400 text-xs mt-1">Team is full</p>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-orange-900 text-orange-300'}`}>
                            {c.status === 'active' ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setViewing(c)}
                              className="px-3 py-1.5 bg-surface border border-surface-border hover:border-admin-light text-white rounded-lg text-xs transition"
                            >
                              View team
                            </button>
                            <button
                              onClick={() => handleToggleStatus(c)}
                              className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-xs transition"
                            >
                              {c.status === 'active' ? 'Suspend' : 'Reactivate'}
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

        <p className="text-gray-500 text-xs">
          Suspending a company stops the whole company, the owner and the team, from using the system. Nothing is deleted.
        </p>
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <div>
                <h2 className="text-lg font-bold text-white">{viewing.name}</h2>
                <p className="text-gray-500 text-xs">Owner: {viewing.owner?.full_name} - {viewing.owner?.email}</p>
              </div>
              <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4">
              {viewing.members.length === 0 ? (
                <p className="text-gray-500 text-sm">No team members yet.</p>
              ) : (
                <div className="divide-y divide-surface-border">
                  {viewing.members.map((m) => (
                    <div key={m.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-white text-sm font-medium">{m.profile?.full_name || 'Unknown'}</p>
                        <p className="text-gray-500 text-xs">{m.profile?.email}</p>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900 text-emerald-300">{m.role_label || ROLE_LABELS[m.role]}</span>
                        <p className={`text-xs mt-1 ${m.status === 'active' ? 'text-green-400' : 'text-orange-400'}`}>{m.status === 'active' ? 'Active' : 'Suspended'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setViewing(null)}
                className="w-full mt-4 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition"
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
