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

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef(null)

  // Loads the profile and, for normal clients, their subscription row.
  const fetchAccount = useCallback(async (userId) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // Ignore the result if the user signed out or changed while we waited
    if (userIdRef.current !== userId) return
    setProfile(profileData)

    if (profileData && profileData.role !== 'admin') {
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (userIdRef.current !== userId) return
      setSubscription(subData ?? null)
    } else {
      setSubscription(null)
    }
  }, [])

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
          setProfile(null)
          setSubscription(null)
        }
        setLoading(false)
      }
    )

    return () => authListener.unsubscribe()
  }, [fetchAccount])

  // Pages can call this after changing the profile or subscription so the
  // whole app picks up the new values (for example after saving branding).
  const refetchProfile = useCallback(async () => {
    if (userIdRef.current) await fetchAccount(userIdRef.current)
  }, [fetchAccount])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const isAdmin = profile?.role === 'admin'

  // The profile's plan is what the app has always used for gating, so it stays
  // the main source. The subscription row is the fallback.
  const planId = normalizePlanId(profile?.plan_type || subscription?.plan_type)
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
    }),
    [user, profile, loading, logout, subscription, planId, plan, refetchProfile, can, limit]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
