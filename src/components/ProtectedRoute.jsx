import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'
import { PLANS, PLAN_ORDER, formatRwf, getPlan } from '../lib/planConfig'
import { FIRST_PAGE_ORDER } from '../lib/permissions'
import InviteChoice from './InviteChoice'
import AccountClosed from './AccountClosed'

// module (optional): the area of the system this page belongs to. Company staff
// who have no access to that area are sent to the first page they can open.
export default function ProtectedRoute({ children, module }) {
  const { user, profile, myProfile, loading, planId, canView, memberBlocked, ownerSuspended, isOrgStaff, inviteChoice } = useAuth()
  const navigate = useNavigate()
  const [subscription, setSubscription] = useState(null)
  const [pendingPayment, setPendingPayment] = useState(null)
  const [subLoading, setSubLoading] = useState(true)

  useEffect(() => {
    if (profile?.id && profile?.role !== 'admin') {
      fetchSubscription()
    } else {
      setSubLoading(false)
    }
  }, [profile])

  const fetchSubscription = async () => {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', profile.id)
      .single()
    setSubscription(data)

    const { data: pending } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('user_id', profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setPendingPayment(pending)

    setSubLoading(false)
  }

  const isExpired = () => {
    if (!subscription?.expiry_date) return false
    return new Date(subscription.expiry_date) < new Date()
  }

  if (loading || subLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Loading profile...</p>
        </div>
      </div>
    )
  }

  // The admin closed this account (moved it to Trash)
  if ((myProfile || profile).is_deleted && profile.role !== 'admin') {
    return <AccountClosed />
  }

  // Invited to a company but already uses KaySales in another account: choose first
  if (inviteChoice && profile.role !== 'admin') {
    return <InviteChoice />
  }

  // The admin suspended this owner's company
  if (ownerSuspended && profile.role !== 'admin') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="bg-surface-elevated border border-red-800 rounded-2xl p-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Company Suspended</h2>
          <p className="text-gray-400 mb-6">Your company account has been suspended. Please contact the KaySales admin.</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </div>
    )
  }

  // Staff whose access (or whose company) has been suspended
  if (memberBlocked) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="bg-surface-elevated border border-red-800 rounded-2xl p-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Access Suspended</h2>
          <p className="text-gray-400 mb-6">Your access to this company has been suspended. Please contact the company owner.</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </div>
    )
  }

  if (!profile.approved && profile.role !== 'admin') {
    return <Navigate to="/choose-plan" />
  }

  if (profile.role !== 'admin' && isExpired()) {
    // Staff do not pay - the company owner renews
    if (isOrgStaff) {
    return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="bg-surface-elevated border border-red-800 rounded-2xl p-8 w-full max-w-md text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Company Subscription Expired</h2>
        <p className="text-gray-400 mb-6">Your company subscription has expired. Please ask the company owner to renew it.</p>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.href = '/login'
          }}
          className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
        >
          Logout
        </button>
      </div>
    </div>
    )
    }
    if (pendingPayment) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center px-4">
          <div className="bg-surface-elevated border border-yellow-800 rounded-2xl p-8 w-full max-w-md text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              Payment Under Review
            </h2>
            <p className="text-gray-400 mb-2">
              We received your payment submission of{' '}
              <span className="text-white font-medium">RWF {pendingPayment.amount?.toLocaleString()}</span>{' '}
              on {new Date(pendingPayment.created_at).toLocaleDateString()}.
            </p>
            <p className="text-gray-400 mb-6">
              An admin is reviewing it now — this usually doesn't take long. You don't need to submit another payment unless this one was made in error.
            </p>
            <button
              onClick={async () => {
                const { supabase } = await import('../lib/supabase')
                await supabase.auth.signOut()
                window.location.href = '/login'
              }}
              className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="bg-surface-elevated border border-red-800 rounded-2xl p-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            {subscription?.is_trial ? 'Free Trial Ended' : 'Subscription Expired'}
          </h2>
          <p className="text-gray-400 mb-2">
            {subscription?.is_trial ? 'Your free trial ended on' : 'Your subscription expired on'}{' '}
            <span className="text-white font-medium">
              {new Date(subscription.expiry_date).toLocaleDateString()}
            </span>
          </p>
          <p className="text-gray-400 mb-6">
            {subscription?.is_trial
              ? 'Choose a plan to keep using KaySales.'
              : 'Please renew your subscription to continue using KaySales.'}
          </p>
          <div className="bg-yellow-900 border border-yellow-700 rounded-xl p-4 mb-6 text-left">
            <p className="text-yellow-300 font-bold mb-2">{subscription?.is_trial ? 'How to subscribe:' : 'How to renew:'}</p>
            <p className="text-yellow-200 text-sm">1. Send payment via MTN Mobile Money</p>
            <p className="text-yellow-200 text-sm">2. Number: <strong className="text-white">0785422754</strong></p>
            <p className="text-yellow-200 text-sm">3. Amount: <strong className="text-white">
              {subscription?.is_trial
                ? PLAN_ORDER.filter((id) => !PLANS[id].requiresAdminSetup)
                    .map((id) => `${PLANS[id].name} ${formatRwf(PLANS[id].price)}`)
                    .join(' or ')
                : formatRwf(getPlan(planId).price)}
            </strong></p>
            <p className="text-yellow-200 text-sm">4. Contact admin with your transaction ID</p>
          </div>
          <button
            onClick={() => navigate('/choose-plan')}
            className="w-full py-3 bg-yellow-500 text-gray-900 rounded-xl font-bold hover:bg-yellow-600 transition mb-3"
          >
            Top Up Now
          </button>
          <button
            onClick={async () => {
              const { supabase } = await import('../lib/supabase')
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </div>
    )
  }

  // Company staff only open the areas they have access to
  if (module && profile.role !== 'admin' && !canView(module)) {
    const first = FIRST_PAGE_ORDER.find(([area]) => canView(area))
    if (first) return <Navigate to={first[1]} replace />
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="bg-surface-elevated border border-surface-border rounded-2xl p-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">No Access</h2>
          <p className="text-gray-400 mb-6">You do not have access to any area yet. Please ask the company owner to set up your access.</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </div>
    )
  }

  return children
}