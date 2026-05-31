import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'

export default function SystemReports() {
  const [stats, setStats] = useState({
    totalClients: 0,
    approvedClients: 0,
    pendingClients: 0,
    standardPlans: 0,
    premiumPlans: 0,
    totalSubscriptions: 0,
    paidSubscriptions: 0,
    estimatedRevenue: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'admin')

    const { data: subsData } = await supabase
      .from('subscriptions')
      .select('*')

    const totalClients = profilesData?.length || 0
    const approvedClients = profilesData?.filter(p => p.approved).length || 0
    const pendingClients = profilesData?.filter(p => !p.approved).length || 0
    const standardPlans = profilesData?.filter(p => p.plan_type === 'standard').length || 0
    const premiumPlans = profilesData?.filter(p => p.plan_type === 'premium').length || 0
    const totalSubscriptions = subsData?.length || 0
    const paidSubscriptions = subsData?.filter(s => s.payment_status === 'paid').length || 0
   const estimatedRevenue = (standardPlans * 45000) + (premiumPlans * 80000)

    setStats({
      totalClients,
      approvedClients,
      pendingClients,
      standardPlans,
      premiumPlans,
      totalSubscriptions,
      paidSubscriptions,
      estimatedRevenue,
    })
    setLoading(false)
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-gray-400 text-lg">Loading reports...</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">📊 System Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Overview of all clients, plans and revenue</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Clients', value: stats.totalClients, icon: '👥' },
            { label: 'Approved Clients', value: stats.approvedClients, icon: '✅' },
            { label: 'Pending Clients', value: stats.pendingClients, icon: '⏳' },
            { label: 'Est. Monthly Revenue', value: `RWF ${stats.estimatedRevenue.toLocaleString()}`, icon: '💰' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-2xl font-bold text-white mt-2">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Plans Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">📦 Plans Breakdown</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-gray-300">Standard Plan</span>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{stats.standardPlans} clients</p>
                  <p className="text-gray-500 text-xs">RWF {(stats.standardPlans * 45000).toLocaleString()}/mo</p>
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: stats.totalClients > 0 ? `${(stats.standardPlans / stats.totalClients) * 100}%` : '0%' }}
                ></div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span className="text-gray-300">Premium Plan</span>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{stats.premiumPlans} clients</p>
                  <p className="text-gray-500 text-xs">RWF {(stats.premiumPlans * 80000).toLocaleString()}/mo</p>
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all"
                  style={{ width: stats.totalClients > 0 ? `${(stats.premiumPlans / stats.totalClients) * 100}%` : '0%' }}
                ></div>
              </div>
            </div>
          </div>

          {/* Subscriptions Breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">💳 Subscriptions Breakdown</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Total Subscriptions</span>
                <span className="text-white font-bold">{stats.totalSubscriptions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Paid</span>
                <span className="text-green-400 font-bold">{stats.paidSubscriptions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Pending</span>
                <span className="text-yellow-400 font-bold">{stats.totalSubscriptions - stats.paidSubscriptions}</span>
              </div>
              <div className="border-t border-gray-800 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-medium">Estimated Monthly Revenue</span>
                  <span className="text-white font-bold">RWF {stats.estimatedRevenue.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </Layout>
  )
}