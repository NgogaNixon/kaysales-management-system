import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getEffectivePlan,
  getLimit,
  getPlanLabel,
  hasFeature,
  isOrganizationPlan,
  normalizePlanId,
} from '../lib/planConfig'
import { resolveAccess } from '../lib/permissions'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // profile = the account the app works as. For a normal client that is their
  // own profile. For company staff it is the company owner's (CEO's) profile,
  // so every page reads and writes the company's data without changes.
  const [profile, setProfile] = useState(null)
  // myProfile = the logged-in person's own profile (name, email)
  const [myProfile, setMyProfile] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [membership, setMembership] = useState(null) // staff row (with its company) or null
  const [ownedOrg, setOwnedOrg] = useState(null) // company this person is CEO of, or null
  // Set when this person was invited to a company but already uses KaySales in another account
  const [inviteChoice, setInviteChoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef(null)
  const inflightRef = useRef(null)

  // Loads everything about the logged-in person: profile, company membership
  // (joining from a pending invite when there is one) and the subscription
  // that applies to them.
  const loadAccount = useCallback(async (userId) => {
    const { data: ownProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // Ignore the result if the user signed out or changed while we waited
    if (userIdRef.current !== userId) return

    // Admins never belong to a company and have no subscription
    if (!ownProfile || ownProfile.role === 'admin') {
      setMyProfile(ownProfile)
      setProfile(ownProfile)
      setSubscription(null)
      setMembership(null)
      setOwnedOrg(null)
      setInviteChoice(null)
      return
    }

    const readMembership = async () => {
      const { data } = await supabase
        .from('organization_members')
        .select('*, organizations(*)')
        .eq('user_id', userId)
        .maybeSingle()
      return data || null
    }

    // Both lookups at once to keep login fast
    const [memberResult, ownedResult] = await Promise.all([
      readMembership(),
      supabase.from('organizations').select('*').eq('owner_id', userId).maybeSingle(),
    ])
    let member = memberResult
    const owned = ownedResult.data

    // Join a company from a pending invite, or find out what this person must choose first
    let choice = null
    try {
      const { data: result } = await supabase.rpc('accept_my_invite')
      if (result?.status === 'joined') {
        member = await readMembership()
      } else if (result?.status === 'needs_choice') {
        choice = result
      } else if (result?.status === 'account_deleted') {
        choice = { ...result, reason: 'closed' }
      }
    } catch {
      // invites are optional - ignore if the function is not available
    }
    // "Decide later" hides the question until the next login
    if (choice?.invite_id && sessionStorage.getItem('kaysales_invite_later') === String(choice.invite_id)) {
      choice = null
    }

    if (userIdRef.current !== userId) return

    const company = member?.organizations || null
    const memberActive = !!member && member.status === 'active' && company?.status === 'active'

    let effectiveProfile = ownProfile
    let effectiveSubscription = null

    if (memberActive) {
      // Staff work as the company owner
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', company.owner_id)
        .single()
      const { data: ownerSub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', company.owner_id)
        .maybeSingle()
      if (userIdRef.current !== userId) return
      if (ownerProfile) {
        effectiveProfile = ownerProfile
        effectiveSubscription = ownerSub || null
      }
    } else if (!member) {
      const { data: ownSub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (userIdRef.current !== userId) return
      effectiveSubscription = ownSub || null
    }

    setMyProfile(ownProfile)
    setMembership(member)
    setOwnedOrg(owned || null)
    setInviteChoice(choice)
    setSubscription(effectiveSubscription)
    // Set last, so the app keeps showing "loading profile" until everything is known
    setProfile(effectiveProfile)
  }, [])

  // Same account loaded twice at once (session + auth event) is shared
  const fetchAccount = useCallback((userId) => {
    if (inflightRef.current && inflightRef.current.userId === userId) {
      return inflightRef.current.promise
    }
    const promise = loadAccount(userId).finally(() => {
      if (inflightRef.current && inflightRef.current.promise === promise) inflightRef.current = null
    })
    inflightRef.current = { userId, promise }
    return promise
  }, [loadAccount])

  const clearAccount = () => {
    setProfile(null)
    setMyProfile(null)
    setSubscription(null)
    setMembership(null)
    setOwnedOrg(null)
    setInviteChoice(null)
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      userIdRef.current = session?.user?.id ?? null
      setUser(session?.user ?? null)
      if (session?.user) fetchAccount(session.user.id)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        userIdRef.current = session?.user?.id ?? null
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchAccount(session.user.id)
        } else {
          clearAccount()
        }
        setLoading(false)
      }
    )

    return () => authListener.unsubscribe()
  }, [fetchAccount])

  // Pages can call this after changing the profile, subscription or team so the
  // whole app picks up the new values (for example after saving branding).
  const refetchProfile = useCallback(async () => {
    if (userIdRef.current) await loadAccount(userIdRef.current)
  }, [loadAccount])

  // The person chose "Decide later" on the invitation question
  const decideLater = useCallback(() => {
    if (inviteChoice?.invite_id) {
      sessionStorage.setItem('kaysales_invite_later', String(inviteChoice.invite_id))
    }
    setInviteChoice(null)
  }, [inviteChoice])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const isAdmin = profile?.role === 'admin'

  // ----- plan -----
  // The profile's plan is what the app has always used for gating, so it stays
  // the main source. The subscription row is the fallback. For staff both are
  // the company owner's, so staff get the company's plan.
  const planId = normalizePlanId(profile?.plan_type || subscription?.plan_type)

  // ----- company (Organization) -----
  // A company only works while its owner is on the Organization plan.
  // If the admin moves the owner to another plan, the company is hidden and the team is blocked
  // (nothing is deleted, and going back to Organization brings it back).
  const ownerCompany = ownedOrg && planId === 'organization' ? ownedOrg : null
  const company = ownerCompany || membership?.organizations || null
  const staffActive =
    !!membership &&
    membership.status === 'active' &&
    membership.organizations?.status === 'active' &&
    planId === 'organization'
  const memberBlocked = !!membership && !staffActive
  // The admin suspended this owner's company: the owner is blocked too
  const ownerSuspended = !!ownerCompany && ownerCompany.status === 'suspended'
  // 'ceo', 'manager', 'sales', 'labor' or null (normal client / admin)
  const orgRole = ownerCompany ? 'ceo' : staffActive ? membership.role : null
  const memberPermissions = membership?.permissions

  // What this person may do in an area: 'none', 'view' or 'write'
  const access = useCallback(
    (module) => (isAdmin ? 'write' : resolveAccess(orgRole, staffActive ? memberPermissions : null, module)),
    [isAdmin, orgRole, staffActive, memberPermissions]
  )
  const canView = useCallback((module) => access(module) !== 'none', [access])
  const canWrite = useCallback((module) => access(module) === 'write', [access])

  const plan = getEffectivePlan(planId)
  const overrides = useMemo(() => subscription?.feature_overrides || {}, [subscription])

  const can = useCallback(
    (feature) => (isAdmin ? true : hasFeature(planId, feature, overrides)),
    [isAdmin, planId, overrides]
  )

  // Returns a number, or null when the limit is unlimited.
  const limit = useCallback(
    (limitKey) => (isAdmin ? null : getLimit(planId, limitKey, overrides)),
    [isAdmin, planId, overrides]
  )

  const value = useMemo(
    () => ({
      user,
      profile,
      myProfile,
      loading,
      logout,
      refetchProfile,
      subscription,
      planId,
      plan,
      planLabel: getPlanLabel(planId),
      isOrganization: isOrganizationPlan(planId),
      isTrial: Boolean(subscription?.is_trial),
      can,
      limit,
      organization: company,
      orgRole,
      isCeo: orgRole === 'ceo',
      isOrgStaff: staffActive,
      memberBlocked,
      ownerSuspended,
      membership,
      inviteChoice,
      decideLater,
      access,
      canView,
      canWrite,
    }),
    [
      user, profile, myProfile, loading, logout, refetchProfile, subscription, planId, plan,
      can, limit, company, orgRole, staffActive, memberBlocked, ownerSuspended, membership, inviteChoice, decideLater, access, canView, canWrite,
    ]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
