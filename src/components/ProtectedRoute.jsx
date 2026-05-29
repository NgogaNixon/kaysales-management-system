import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'

export default function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth()
  const [subscription, setSubscription] = useState(null)
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
    setSubLoading(false)
  }

  const isExpired = () => {
    if (!subscription?.expiry_date) return false
    return new Date(subscription.expiry_date) < new Date()
  }

  if (loading || subLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!profile.approved && profile.role !== 'admin') {
    return <Navigate to="/choose-plan" />
  }

  if (profile.role !== 'admin' && isExpired()) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 border border-red-800 rounded-2xl p-8 w-full max-w-md text-center">
          <span className="text-5xl">🔒</span>
          <h2 className="text-2xl font-bold text-white mt-4 mb-2">
            Subscription Expired
          </h2>
          <p className="text-gray-400 mb-2">
            Your subscription expired on{' '}
            <span className="text-white font-medium">
              {new Date(subscription.expiry_date).toLocaleDateString()}
            </span>
          </p>
          <p className="text-gray-400 mb-6">
            Please renew your subscription to continue using KaySales.
          </p>
          <div className="bg-yellow-900 border border-yellow-700 rounded-xl p-4 mb-6 text-left">
            <p className="text-yellow-300 font-bold mb-2">How to renew:</p>
            <p className="text-yellow-200 text-sm">1. Send payment via MTN Mobile Money</p>
            <p className="text-yellow-200 text-sm">2. Number: <strong className="text-white">0785422754</strong></p>
            <p className="text-yellow-200 text-sm">3. Amount: <strong className="text-white">
              RWF {subscription?.plan_type === 'premium' ? '80,000' : '50,000'}
            </strong></p>
            <p className="text-yellow-200 text-sm">4. Contact admin with your transaction ID</p>
          </div>
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

  return children
}