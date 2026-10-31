import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'
import { PLANS, PLAN_ORDER, formatRwf } from '../../lib/planConfig'

// Bar / dot colour for each plan in the breakdown
const PLAN_COLORS = {
  standard: 'bg-primary',
  premium: 'bg-purple-500',
  organization: 'bg-emerald-500',
}

export default function SystemReports() {
  const [stats, setStats] = useState({
    totalClients: 0,
    approvedClients: 0,
    pendingClients: 0,
    planCounts: {},
    trialClients: 0,
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
      .eq('is_deleted', false)

    const { data: subsData } = await supabase
      .from('subscriptions')
      .select('*')

    const totalClients = profilesData?.length || 0
    const approved = profilesData?.filter(p => p.approved) || []
    const approvedClients = approved.length
    const pendingClients = profilesData?.filter(p => !p.approved).length || 0

    // Only approved clients are actually active — matches the same methodology
    // AdminDashboard uses, so both pages report consistent figures. Free-trial
    // clients are counted on their own line and are not billed.
    const trialUserIds = new Set(subsData?.filter(s => s.is_trial).map(s => s.user_id))
    const trialClients = approved.filter(p => trialUserIds.has(p.id)).length
    const planCounts = {}
    PLAN_ORDER.forEach((id) => {
      planCounts[id] = approved.filter(p => p.plan_type === id && !trialUserIds.has(p.id)).length
    })

    const totalSubscriptions = subsData?.length || 0
    const paidSubscriptions = subsData?.filter(s => s.payment_status === 'paid').length || 0
    // Monthly estimate from planConfig prices (every plan is billed monthly)
    const estimatedRevenue = PLAN_ORDER.reduce((sum, id) => sum + planCounts[id] * PLANS[id].price, 0)

    setStats({
      totalClients,
      approvedClients,
      pendingClients,
      planCounts,
      trialClients,
      totalSubscriptions,
      paidSubscriptions,
      estimatedRevenue,
    })
    setLoading(false)
  }

  // Standard and Premium always show; other plans appear once someone is on them
  const visiblePlans = PLAN_ORDER.filter(
    (id) => id === 'standard' || id === 'premium' || (stats.planCounts[id] || 0) > 0
  )
  const percentOfClients = (count) =>
    stats.totalClients > 0 ? `${(count / stats.totalClients) * 100}%` : '0%'

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
          <h1 className="text-2xl font-bold text-white">System Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Overview of all clients, plans and revenue</p>
        </div>

        {/* Plans Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Plans Breakdown</h2>
            <p className="text-gray-500 text-xs mb-4">Approved, paying clients only. Free trials are listed separately and not counted as revenue.</p>
            <div className="space-y-4">
              {visiblePlans.map((id, index) => (
                <div key={id} className={index > 0 ? 'space-y-4 mt-4' : 'space-y-4'}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${PLAN_COLORS[id]}`}></div>
                      <span className="text-gray-300">{PLANS[id].name} Plan</span>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">{stats.planCounts[id] || 0} clients</p>
                      <p className="text-gray-500 text-xs">{formatRwf((stats.planCounts[id] || 0) * PLANS[id].price)}/mo</p>
                    </div>
                  </div>
                  <div className="w-full bg-surface rounded-full h-2">
                    <div
                      className={`${PLAN_COLORS[id]} h-2 rounded-full transition-all`}
                      style={{ width: percentOfClients(stats.planCounts[id] || 0) }}
                    ></div>
                  </div>
                </div>
              ))}

              <div className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-gray-300">Free Trial</span>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">{stats.trialClients} clients</p>
                    <p className="text-gray-500 text-xs">Not billed</p>
                  </div>
                </div>
                <div className="w-full bg-surface rounded-full h-2">
                  <div
                    className="bg-yellow-500 h-2 rounded-full transition-all"
                    style={{ width: percentOfClients(stats.trialClients) }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Subscriptions Breakdown */}
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Subscriptions Breakdown</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Total Clients</span>
                <span className="text-white font-bold">{stats.totalClients}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Approved</span>
                <span className="text-green-400 font-bold">{stats.approvedClients}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Pending</span>
                <span className="text-yellow-400 font-bold">{stats.pendingClients}</span>
              </div>
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
              <div className="border-t border-surface-border pt-4">
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
