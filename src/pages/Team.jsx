import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { PLANS } from '../lib/planConfig'
import { ROLES, ROLE_LABELS, ROLE_DEFAULTS, MODULE_LABELS } from '../lib/permissions'

// Areas the CEO can set for each person, with the choices that make sense for each.
// Team and Account settings stay with the CEO and are not listed.
const EDITABLE_MODULES = [
  { module: 'dashboard', levels: ['none', 'view'], hint: 'Summary figures' },
  { module: 'products', levels: ['none', 'view', 'write'], hint: 'Stock list' },
  { module: 'sales', levels: ['none', 'view', 'write'], hint: 'Record and see sales' },
  { module: 'credits', levels: ['none', 'view', 'write'], hint: 'Money owed to and by the business' },
  { module: 'quotations', levels: ['none', 'view', 'write'], hint: 'Price quotes for customers' },
  { module: 'expenses', levels: ['none', 'view', 'write'], hint: 'Business expenses' },
  { module: 'analysis', levels: ['none', 'view'], hint: 'Charts and trends' },
  { module: 'financials', levels: ['none', 'view'], hint: 'Profit and expense breakdown' },
  { module: 'approvals', levels: ['none', 'write'], hint: 'Can approve or reject staff requests' },
]

const levelLabel = (module, level) => {
  if (level === 'none') return 'No access'
  if (module === 'approvals') return 'Allowed'
  if (level === 'view') return EDITABLE_MODULES.find((m) => m.module === module)?.levels.includes('write') ? 'View only' : 'Allowed'
  return 'Add & edit'
}

const roleDefaultLevels = (role) => {
  const levels = {}
  EDITABLE_MODULES.forEach(({ module }) => {
    levels[module] = ROLE_DEFAULTS[role]?.[module] || 'none'
  })
  return levels
}

// Access levels of a company role: the standard role's defaults plus the role's own changes
const levelsOfRole = (row) => {
  const levels = { ...roleDefaultLevels(row.base_role) }
  EDITABLE_MODULES.forEach(({ module }) => {
    const value = row.permissions?.[module]
    if (value === 'none' || value === 'view' || value === 'write') levels[module] = value
  })
  return levels
}

// Only what differs from the standard role's defaults is stored
const overridesFor = (base, levels) => {
  const defaults = roleDefaultLevels(base)
  const overrides = {}
  EDITABLE_MODULES.forEach(({ module }) => {
    if (levels[module] !== defaults[module]) overrides[module] = levels[module]
  })
  return overrides
}

const sameAccess = (a, b) => {
  const first = a || {}
  const second = b || {}
  const keys = [...new Set([...Object.keys(first), ...Object.keys(second)])]
  return keys.every((key) => first[key] === second[key])
}

// First time only: create the three standard roles for this company
// and link the people who already have them
async function seedBuiltInRoles(orgId) {
  const rows = ROLES.map((r) => ({
    organization_id: orgId,
    name: ROLE_LABELS[r],
    base_role: r,
    permissions: {},
    is_builtin: true,
  }))
  const { data: created, error } = await supabase.from('organization_roles').insert(rows).select()
  if (error || !created) return

  for (const role of created) {
    await supabase
      .from('organization_members')
      .update({ role_id: role.id, role_label: role.name })
      .eq('organization_id', orgId)
      .eq('role', role.base_role)
      .is('role_id', null)
    await supabase
      .from('organization_invites')
      .update({ role_id: role.id, role_label: role.name })
      .eq('organization_id', orgId)
      .eq('role', role.base_role)
      .is('role_id', null)
  }
}

// Reads the team (members with their names, and pending invitations) from the database
async function fetchTeamData(orgId) {
  const { data: memberRows } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', orgId)
    .order('joined_at', { ascending: true })

  const ids = (memberRows || []).map((m) => m.user_id)
  let profileMap = {}
  if (ids.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids)
    profileMap = Object.fromEntries((profileRows || []).map((p) => [p.id, p]))
  }

  const { data: inviteRows } = await supabase
    .from('organization_invites')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const { data: roleRows } = await supabase
    .from('organization_roles')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  return {
    members: (memberRows || []).map((m) => ({ ...m, profile: profileMap[m.user_id] || null })),
    invites: inviteRows || [],
    roles: roleRows || [],
  }
}

export default function Team() {
  const { organization, isCeo, can } = useAuth()
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roles, setRoles] = useState([])
  const [inviteForm, setInviteForm] = useState({ email: '', roleId: '' })
  const [roleForm, setRoleForm] = useState(null)
  const [savingRole, setSavingRole] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [lastInvite, setLastInvite] = useState(null)
  const [copied, setCopied] = useState('')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const seatLimit = organization?.seat_limit ?? PLANS.organization.limits.maxSeats
  const seatsUsed = members.length + invites.length
  const orgId = organization?.id

  // Bump this to reload the team after any change
  const [refreshKey, setRefreshKey] = useState(0)
  const loadTeam = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    if (!orgId) return
    let active = true
    const load = async () => {
      let result = await fetchTeamData(orgId)
      // First time: create the three standard roles for this company
      if (result.roles.length === 0) {
        await seedBuiltInRoles(orgId)
        result = await fetchTeamData(orgId)
      }
      if (!active) return
      setMembers(result.members)
      setInvites(result.invites)
      setRoles(result.roles)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [orgId, refreshKey])

  const signupLink = `${window.location.origin}/signup`

  // The role chosen in the invite form (the Sales role is the starting choice)
  const inviteRoleId = inviteForm.roleId || roles.find((r) => r.base_role === 'sales')?.id || roles[0]?.id || ''

  // The company role a person holds
  const roleOfMember = (member) =>
    roles.find((r) => r.id === member.role_id) ||
    roles.find((r) => r.is_builtin && r.base_role === member.role)

  // True when a person's access was changed away from their role
  const hasPersonalChanges = (member) => {
    const row = roleOfMember(member)
    return row ? !sameAccess(member.permissions, row.permissions) : Object.keys(member.permissions || {}).length > 0
  }

  const holdersOf = (roleId) =>
    members.filter((m) => m.role_id === roleId).length + invites.filter((i) => i.role_id === roleId).length

  const instructionsFor = (email, roleLabel) =>
    `You have been invited to join ${organization?.name} on KaySales as ${roleLabel}.\n` +
    `1. Open ${signupLink} and sign up using this exact email address: ${email}\n` +
    `2. Confirm your email from the link we send you.\n` +
    `3. Log in. You will be added to ${organization?.name} automatically.\n` +
    `If you already use KaySales with this email, log in. You will be asked to leave your current company or delete that account before you can join.`

  const copyText = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const handleInvite = async () => {
    setError('')
    const email = inviteForm.email.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    if (members.some((m) => m.profile?.email?.toLowerCase() === email)) {
      setError('This person is already in your team.')
      return
    }
    const roleRow = roles.find((r) => r.id === inviteRoleId)
    if (!roleRow) {
      setError('Choose a role first.')
      return
    }
    setInviting(true)

    // Does this email already use KaySales in another account?
    const { data: check } = await supabase.rpc('check_invite_email', { p_email: email })
    if (check?.status === 'in_your_team') {
      setInviting(false)
      setError('This person is already in your team.')
      return
    }
    const existing = check?.status === 'busy'

    const { error: insertError } = await supabase.from('organization_invites').insert({
      organization_id: orgId,
      email,
      role: roleRow.base_role,
      permissions: roleRow.permissions,
      role_id: roleRow.id,
      role_label: roleRow.name,
      existing_account: existing,
    })
    setInviting(false)
    if (insertError) {
      if (insertError.code === '23505') setError('This email already has a pending invitation.')
      else setError(insertError.message)
      return
    }
    setLastInvite({ email, roleLabel: roleRow.name, existing })
    setInviteForm({ email: '', roleId: roleRow.id })
    loadTeam()
  }

  const openEditor = (member) => {
    const roleRow = roleOfMember(member)
    const levels = { ...roleDefaultLevels(member.role) }
    EDITABLE_MODULES.forEach(({ module }) => {
      const custom = member.permissions?.[module]
      if (custom === 'none' || custom === 'view' || custom === 'write') levels[module] = custom
    })
    setEditing({ member, roleId: roleRow?.id || '', levels })
  }

  const changeEditingRole = (roleId) => {
    const row = roles.find((r) => r.id === roleId)
    if (!row) return
    setEditing({ ...editing, roleId, levels: levelsOfRole(row) })
  }

  const handleSaveAccess = async () => {
    const row = roles.find((r) => r.id === editing.roleId)
    if (!row) {
      setError('Choose a role first.')
      return
    }
    setError('')
    setSaving(true)
    const overrides = overridesFor(row.base_role, editing.levels)
    const { error: updateError } = await supabase
      .from('organization_members')
      .update({ role: row.base_role, permissions: overrides, role_id: row.id, role_label: row.name })
      .eq('id', editing.member.id)
    setSaving(false)
    if (updateError) {
      setError('Could not save access: ' + updateError.message)
      return
    }
    setEditing(null)
    loadTeam()
  }

  // ----- Roles -----
  const openNewRole = () => {
    setRoleForm({ id: null, name: '', base: 'sales', levels: roleDefaultLevels('sales'), isBuiltin: false, applyToHolders: false })
  }

  const openEditRole = (row) => {
    setRoleForm({ id: row.id, name: row.name, base: row.base_role, levels: levelsOfRole(row), isBuiltin: row.is_builtin, applyToHolders: false })
  }

  const changeRoleBase = (base) => {
    setRoleForm({ ...roleForm, base, levels: roleDefaultLevels(base) })
  }

  const handleSaveRole = async () => {
    setError('')
    const name = roleForm.name.trim()
    if (!name) {
      setError('Give the role a name.')
      return
    }
    setSavingRole(true)
    const permissions = overridesFor(roleForm.base, roleForm.levels)

    if (roleForm.id) {
      const { error: updateError } = await supabase
        .from('organization_roles')
        .update({ name, base_role: roleForm.base, permissions })
        .eq('id', roleForm.id)
      if (updateError) {
        setSavingRole(false)
        setError(updateError.code === '23505' ? 'A role with this name already exists.' : 'Could not save the role: ' + updateError.message)
        return
      }
      // Everyone who has this role shows the new name
      await supabase.from('organization_members').update({ role_label: name }).eq('role_id', roleForm.id)
      await supabase.from('organization_invites').update({ role_label: name }).eq('role_id', roleForm.id)
      // Optional: give everyone with this role the new access too
      if (roleForm.applyToHolders) {
        await supabase.from('organization_members').update({ role: roleForm.base, permissions }).eq('role_id', roleForm.id)
        await supabase.from('organization_invites').update({ role: roleForm.base, permissions }).eq('role_id', roleForm.id)
      }
    } else {
      const { error: insertError } = await supabase
        .from('organization_roles')
        .insert({ organization_id: orgId, name, base_role: roleForm.base, permissions })
      if (insertError) {
        setSavingRole(false)
        setError(insertError.code === '23505' ? 'A role with this name already exists.' : 'Could not add the role: ' + insertError.message)
        return
      }
    }

    setSavingRole(false)
    setRoleForm(null)
    loadTeam()
  }

  const handleToggleSuspend = async (member) => {
    setError('')
    const next = member.status === 'active' ? 'suspended' : 'active'
    const { error: updateError } = await supabase
      .from('organization_members')
      .update({ status: next })
      .eq('id', member.id)
    if (updateError) {
      setError('Could not update this person: ' + updateError.message)
      return
    }
    loadTeam()
  }

  const handleConfirm = async () => {
    setError('')
    if (confirm.kind === 'remove') {
      const { error: deleteError } = await supabase.from('organization_members').delete().eq('id', confirm.id)
      if (deleteError) setError('Could not remove this person: ' + deleteError.message)
    } else if (confirm.kind === 'role') {
      const { error: deleteError } = await supabase.from('organization_roles').delete().eq('id', confirm.id)
      if (deleteError) setError('Could not delete the role: ' + deleteError.message)
    } else {
      const { error: updateError } = await supabase
        .from('organization_invites')
        .update({ status: 'revoked' })
        .eq('id', confirm.id)
      if (updateError) setError('Could not cancel the invitation: ' + updateError.message)
    }
    setConfirm(null)
    loadTeam()
  }

  if (!isCeo || !organization) {
    return (
      <Layout>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <div className="mt-6 max-w-lg bg-surface-elevated border border-surface-border rounded-xl p-8 text-center">
            <p className="text-gray-300">Only the company owner can manage the team.</p>
          </div>
        </div>
      </Layout>
    )
  }

  if (!can('teamAccounts')) {
    return (
      <Layout>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <div className="mt-6 max-w-lg bg-surface-elevated border border-surface-border rounded-xl p-8 text-center">
            <p className="text-gray-300">Team accounts are not included in your current plan.</p>
            <p className="text-gray-500 text-sm mt-2">Contact us to switch to the Organization plan.</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Team</h1>
            <p className="text-gray-400 text-sm mt-1">{organization.name}</p>
          </div>
          <span className="text-xs px-3 py-2 rounded-lg bg-surface-elevated border border-surface-border text-gray-300">
            {seatsUsed} of {seatLimit} team places used
          </span>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 rounded-xl p-4 flex items-center justify-between">
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={() => setError('')} className="text-red-400 hover:text-white text-sm">✕</button>
          </div>
        )}

        {/* Invite */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-1">Invite someone</h2>
          <p className="text-gray-400 text-sm mb-4">
            They sign up with the email address you enter and are added to your company automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              placeholder="Email address"
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              className="flex-1 bg-surface border border-surface-border text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
            />
            <select
              value={inviteRoleId}
              onChange={(e) => setInviteForm({ ...inviteForm, roleId: e.target.value })}
              className="bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={inviting || seatsUsed >= seatLimit}
              className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition disabled:opacity-50"
            >
              {inviting ? 'Sending...' : 'Send invitation'}
            </button>
          </div>
          {seatsUsed >= seatLimit && (
            <p className="text-yellow-400 text-xs mt-3">You have used all your team places. Contact admin to add more.</p>
          )}
          <p className="text-gray-500 text-xs mt-3">
            Roles decide what each person can see and do. Add your own roles in the Roles section below, and fine-tune each person afterwards.
          </p>

          {lastInvite && (
            <div className="mt-4 bg-surface border border-surface-border rounded-lg p-4">
              <p className="text-green-400 text-sm font-medium">Invitation created for {lastInvite.email}</p>
              {lastInvite.existing && (
                <p className="text-yellow-300 text-xs mt-2 bg-yellow-900 border border-yellow-700 rounded-lg p-3">
                  Note: this email already uses KaySales in another account. Before they can join your company,
                  they will be asked to leave their current company or delete their existing account. You can
                  also invite a different email.
                </p>
              )}
              <p className="text-gray-400 text-xs mt-1">Send them these instructions (for example on WhatsApp):</p>
              <pre className="text-gray-300 text-xs mt-2 whitespace-pre-wrap font-sans">{instructionsFor(lastInvite.email, lastInvite.roleLabel)}</pre>
              <button
                onClick={() => copyText('last', instructionsFor(lastInvite.email, lastInvite.roleLabel))}
                className="mt-3 px-3 py-1.5 bg-surface-elevated border border-surface-border hover:border-primary text-white rounded-lg text-xs transition"
              >
                {copied === 'last' ? 'Copied' : 'Copy instructions'}
              </button>
            </div>
          )}
        </div>

        {/* Members */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-border">
            <h2 className="text-lg font-bold text-white">Team members</h2>
          </div>
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-10">Loading team...</p>
          ) : members.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-10">No team members yet. Invite someone above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-3 font-medium">Name</th>
                    <th className="text-left text-gray-400 px-6 py-3 font-medium">Role</th>
                    <th className="text-left text-gray-400 px-6 py-3 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-3 font-medium">Joined</th>
                    <th className="text-left text-gray-400 px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-t border-surface-border">
                      <td className="px-6 py-4">
                        <p className="text-white font-medium">{m.profile?.full_name || 'Unknown'}</p>
                        <p className="text-gray-500 text-xs">{m.profile?.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-900 text-emerald-300">
                          {m.role_label || ROLE_LABELS[m.role]}
                        </span>
                        {hasPersonalChanges(m) && (
                          <span className="ml-2 text-xs text-gray-500">custom access</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          m.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-orange-900 text-orange-300'
                        }`}>
                          {m.status === 'active' ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400">{new Date(m.joined_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openEditor(m)}
                            className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs transition"
                          >
                            Edit access
                          </button>
                          <button
                            onClick={() => handleToggleSuspend(m)}
                            className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-xs transition"
                          >
                            {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </button>
                          <button
                            onClick={() => setConfirm({ kind: 'remove', id: m.id, label: m.profile?.full_name || m.profile?.email })}
                            className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition"
                          >
                            Remove
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

        {/* Roles */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Roles</h2>
              <p className="text-gray-500 text-xs mt-1">Add your own roles, rename them, and choose what each one can see and do.</p>
            </div>
            <button
              onClick={openNewRole}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition"
            >
              + Add role
            </button>
          </div>
          {roles.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Roles are not available yet. Ask the admin to finish the roles setup.</p>
          ) : (
            <div className="divide-y divide-surface-border">
              {roles.map((r) => {
                const holders = holdersOf(r.id)
                return (
                  <div key={r.id} className="px-6 py-4 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-white text-sm font-medium">{r.name}</p>
                      <p className="text-gray-500 text-xs">
                        {holders} {holders === 1 ? 'person' : 'people'} - starts from {ROLE_LABELS[r.base_role]} access
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditRole(r)}
                        className="px-3 py-1.5 bg-surface border border-surface-border hover:border-primary text-white rounded-lg text-xs transition"
                      >
                        Rename / Edit
                      </button>
                      {!r.is_builtin && (
                        <button
                          onClick={() =>
                            holders > 0
                              ? setError('Move the people who have this role to another role first.')
                              : setConfirm({ kind: 'role', id: r.id, label: r.name })
                          }
                          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pending invitations */}
        {invites.length > 0 && (
          <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border">
              <h2 className="text-lg font-bold text-white">Pending invitations</h2>
            </div>
            <div className="divide-y divide-surface-border">
              {invites.map((inv) => (
                <div key={inv.id} className="px-6 py-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-white text-sm font-medium">{inv.email}</p>
                    <p className="text-gray-500 text-xs">
                      {inv.role_label || ROLE_LABELS[inv.role]} - invited {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                    {inv.existing_account && (
                      <p className="text-yellow-400 text-xs mt-1">Already uses KaySales - waiting for them to choose</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyText(inv.id, instructionsFor(inv.email, inv.role_label || ROLE_LABELS[inv.role]))}
                      className="px-3 py-1.5 bg-surface border border-surface-border hover:border-primary text-white rounded-lg text-xs transition"
                    >
                      {copied === inv.id ? 'Copied' : 'Copy instructions'}
                    </button>
                    <button
                      onClick={() => setConfirm({ kind: 'invite', id: inv.id, label: inv.email })}
                      className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-gray-500 text-xs">
          Team members can add and change records only in the areas you allow. They can never delete anything: deletes need your approval.
        </p>
      </div>

      {/* Add / edit role modal */}
      {roleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <h2 className="text-lg font-bold text-white">{roleForm.id ? 'Edit role' : 'Add role'}</h2>
              <button onClick={() => setRoleForm(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Role name</label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                  placeholder="e.g. Cashier"
                />
              </div>

              {!roleForm.isBuiltin && (
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Start from</label>
                  <select
                    value={roleForm.base}
                    onChange={(e) => changeRoleBase(e.target.value)}
                    className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <p className="text-gray-500 text-xs mt-1">Changing this resets the access below to that role's defaults.</p>
                </div>
              )}

              <div className="space-y-3">
                {EDITABLE_MODULES.map(({ module, levels, hint }) => (
                  <div key={module} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-white text-sm">{MODULE_LABELS[module]}</p>
                      <p className="text-gray-500 text-xs">{hint}</p>
                    </div>
                    <select
                      value={roleForm.levels[module]}
                      onChange={(e) => setRoleForm({ ...roleForm, levels: { ...roleForm.levels, [module]: e.target.value } })}
                      className="bg-surface border border-surface-border text-white px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:border-primary"
                    >
                      {levels.map((level) => (
                        <option key={level} value={level}>{levelLabel(module, level)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {roleForm.id && (
                <label className="flex items-start gap-2 text-gray-400 text-xs">
                  <input
                    type="checkbox"
                    checked={roleForm.applyToHolders}
                    onChange={(e) => setRoleForm({ ...roleForm, applyToHolders: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>Also give this access to everyone who already has this role (this replaces any changes made for a single person).</span>
                </label>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setRoleForm(null)}
                  className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRole}
                  disabled={savingRole}
                  className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium disabled:opacity-50"
                >
                  {savingRole ? 'Saving...' : 'Save role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit access modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <div>
                <h2 className="text-lg font-bold text-white">Edit access</h2>
                <p className="text-gray-500 text-xs">{editing.member.profile?.full_name} - {editing.member.profile?.email}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Role</label>
                <select
                  value={editing.roleId}
                  onChange={(e) => changeEditingRole(e.target.value)}
                  className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <p className="text-gray-500 text-xs mt-1">Changing the role resets the access below to that role's defaults.</p>
              </div>

              <div className="space-y-3">
                {EDITABLE_MODULES.map(({ module, levels, hint }) => (
                  <div key={module} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-white text-sm">{MODULE_LABELS[module]}</p>
                      <p className="text-gray-500 text-xs">{hint}</p>
                    </div>
                    <select
                      value={editing.levels[module]}
                      onChange={(e) => setEditing({ ...editing, levels: { ...editing.levels, [module]: e.target.value } })}
                      className="bg-surface border border-surface-border text-white px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:border-primary"
                    >
                      {levels.map((level) => (
                        <option key={level} value={level}>{levelLabel(module, level)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <p className="text-gray-500 text-xs">
                Tip: charts and the dashboard read from sales and products, so give View access to those areas too.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditing(null)}
                  className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAccess}
                  disabled={saving}
                  className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save access'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm remove / cancel */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-surface-elevated border border-red-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-2 text-center">
              {confirm.kind === 'remove' ? 'Remove from team' : confirm.kind === 'role' ? 'Delete role' : 'Cancel invitation'}
            </h2>
            <p className="text-gray-400 text-sm mb-6 text-center">
              {confirm.kind === 'remove'
                ? `${confirm.label} will lose access to your company straight away. Everything they recorded stays in your records.`
                : confirm.kind === 'role'
                ? `The role ${confirm.label} will be deleted. Nobody has it right now.`
                : `The invitation for ${confirm.label} will no longer work.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition font-medium"
              >
                Keep
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
              >
                {confirm.kind === 'remove' ? 'Remove' : confirm.kind === 'role' ? 'Delete role' : 'Cancel invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
