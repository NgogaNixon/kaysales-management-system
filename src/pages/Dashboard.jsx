import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // Redirect admin to admin dashboard
  useEffect(() => {
    if (profile?.role === 'admin') {
      navigate('/admin')
    }
  }, [profile])

  const [stats, setStats] = useState({
    totalSales: 0,
    totalRevenue: 0,
    totalProducts: 0,
    creditsGiven: 0,
    creditsTaken: 0,
    lowStockProducts: [],
    recentSales: [],
  })
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState(null)

  useEffect(() => {
    if (profile?.id) {
      fetchDashboardData()
      fetchSubscription()
    }
  }, [profile])

  const fetchSubscription = async () => {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', profile.id)
      .single()
    setSubscription(data)
  }

  const fetchDashboardData = async () => {
    setLoading(true)

    // Total sales & revenue
    const { data: salesData } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', profile.id)

    // Total products
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', profile.id)

    // Credits given
    const { data: creditsGivenData } = await supabase
      .from('credits_given')
      .select('amount')
      .eq('user_id', profile.id)

    // Credits taken
    const { data: creditsTakenData } = await supabase
      .from('credits_taken')
      .select('amount')
      .eq('user_id', profile.id)

    const totalRevenue = salesData?.reduce((sum, s) => sum + (s.total || 0), 0) || 0
    const creditsGivenTotal = creditsGivenData?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0
    const creditsTakenTotal = creditsTakenData?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0
    const lowStock = productsData?.filter(p => p.quantity < 10) || []
    const recentSales = salesData?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5) || []

    setStats({
      totalSales: salesData?.length || 0,
      totalRevenue,
      totalProducts: productsData?.length || 0,
      creditsGiven: creditsGivenTotal,
      creditsTaken: creditsTakenTotal,
      lowStockProducts: lowStock,
      recentSales,
    })
    setLoading(false)
  }

  const getDaysRemaining = () => {
    if (!subscription?.expiry_date) return null
    const today = new Date()
    const expiry = new Date(subscription.expiry_date)
    const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
    return diff
  }

  const daysRemaining = getDaysRemaining()

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-gray-400 text-lg">Loading dashboard...</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {profile?.full_name?.split(' ')[0]} 👋
            </h1>
            <p className="text-gray-400 text-sm mt-1">Here's what's happening with your business today</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-sm">{new Date().toLocaleDateString('en-RW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        {/* Subscription Reminder */}
        {daysRemaining !== null && daysRemaining <= 7 && (
          <div className={`rounded-xl p-4 flex items-center justify-between ${daysRemaining <= 3 ? 'bg-red-900 border border-red-700' : 'bg-yellow-900 border border-yellow-700'}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏰</span>
              <div>
                <p className={`font-bold ${daysRemaining <= 3 ? 'text-red-300' : 'text-yellow-300'}`}>
                  Subscription {daysRemaining <= 0 ? 'Expired!' : `Expiring in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}!`}
                </p>
                <p className="text-gray-400 text-sm">Please top up your subscription to keep access</p>
              </div>
            </div>
            <button className={`px-4 py-2 rounded-lg font-bold text-sm ${daysRemaining <= 3 ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'} transition`}>
              Top Up Now
            </button>
          </div>
        )}

        {/* Low Stock Alerts */}
        {stats.lowStockProducts.length > 0 && (
          <div className="bg-orange-900 border border-orange-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⚠️</span>
              <p className="font-bold text-orange-300">Low Stock Alert — {stats.lowStockProducts.length} product{stats.lowStockProducts.length > 1 ? 's' : ''} running low</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.lowStockProducts.map((p) => (
                <span key={p.id} className="bg-orange-800 text-orange-200 px-3 py-1 rounded-full text-xs font-medium">
                  {p.name} — {p.quantity} left
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Total Sales', value: stats.totalSales, icon: '🧾', color: 'blue' },
            { label: 'Total Revenue', value: `RWF ${stats.totalRevenue.toLocaleString()}`, icon: '💵', color: 'green' },
            { label: 'Products', value: stats.totalProducts, icon: '📦', color: 'purple' },
            { label: 'Credits Given', value: `RWF ${stats.creditsGiven.toLocaleString()}`, icon: '📤', color: 'yellow' },
            { label: 'Credits Taken', value: `RWF ${stats.creditsTaken.toLocaleString()}`, icon: '📥', color: 'red' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{stat.icon}</span>
              </div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Sales */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Recent Sales</h2>
            <button
              onClick={() => navigate('/sales')}
              className="text-blue-400 hover:text-blue-300 text-sm transition"
            >
              View All →
            </button>
          </div>

          {stats.recentSales.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No sales recorded yet</p>
              <button
                onClick={() => navigate('/sales')}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
              >
                Record First Sale
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-400 pb-3 font-medium">Product</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Qty</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Total</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="space-y-2">
                  {stats.recentSales.map((sale) => (
                    <tr key={sale.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                      <td className="py-3 text-white">{sale.product_name}</td>
                      <td className="py-3 text-gray-300">{sale.quantity_sold}</td>
                      <td className="py-3 text-green-400 font-medium">RWF {sale.total?.toLocaleString()}</td>
                      <td className="py-3 text-gray-400">{new Date(sale.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </Layout>
  )
}