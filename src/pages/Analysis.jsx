import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Analysis() {
  const { profile } = useAuth()
  const [saleItems, setSaleItems] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')

  const isPremium = profile?.plan_type === 'premium'

  useEffect(() => {
    if (profile?.id) fetchData()
  }, [profile])

  const fetchData = async () => {
    setLoading(true)

    const { data: salesData } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: true })

    const { data: itemsData } = await supabase
      .from('sale_items')
      .select('*')
      .eq('user_id', profile.id)

    setSales(salesData || [])
    setSaleItems(itemsData || [])
    setLoading(false)
  }

  // Filter sales by date
  const filteredSales = sales.filter(s => {
    const d = new Date(s.created_at)
    const from = dateFrom ? d >= new Date(dateFrom) : true
    const to = dateTo ? d <= new Date(dateTo + 'T23:59:59') : true
    return from && to
  })

  // Get sale IDs for filtered sales
  const filteredSaleIds = filteredSales.map(s => s.id)

  // Filter sale items by filtered sale IDs
  const filteredItems = saleItems.filter(i => filteredSaleIds.includes(i.sale_id))

  // 1. Revenue Over Time (by day)
  const revenueByDay = filteredSales.reduce((acc, sale) => {
    const date = new Date(sale.created_at).toLocaleDateString()
    acc[date] = (acc[date] || 0) + (sale.total || 0)
    return acc
  }, {})
  const revenueChartData = Object.entries(revenueByDay).map(([date, total]) => ({ date, total }))

  // 2. Best Selling Products (by quantity from sale_items)
  const productQty = filteredItems.reduce((acc, item) => {
    acc[item.product_name] = (acc[item.product_name] || 0) + (item.quantity_sold || 0)
    return acc
  }, {})
  const bestSellingData = Object.entries(productQty)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  // 3. Revenue by Product (from sale_items)
  const productRevenue = filteredItems.reduce((acc, item) => {
    acc[item.product_name] = (acc[item.product_name] || 0) + (item.total || 0)
    return acc
  }, {})
  const revenueByProductData = Object.entries(productRevenue)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  // 4. Daily Sales Summary (count per day)
  const salesPerDay = filteredSales.reduce((acc, sale) => {
    const date = new Date(sale.created_at).toLocaleDateString()
    acc[date] = (acc[date] || 0) + 1
    return acc
  }, {})
  const dailySalesData = Object.entries(salesPerDay).map(([date, count]) => ({ date, count }))

  // PREMIUM CHARTS

  // 5. Revenue by Category
  const categoryRevenue = filteredItems.reduce((acc, item) => {
    // We need product category — join via product_id
    return acc
  }, {})

  // 5. Best Selling Day of Week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const revenueByDayOfWeek = filteredSales.reduce((acc, sale) => {
    const day = dayNames[new Date(sale.created_at).getDay()]
    acc[day] = (acc[day] || 0) + (sale.total || 0)
    return acc
  }, {})
  const dayOfWeekData = dayNames.map(day => ({ day, total: revenueByDayOfWeek[day] || 0 }))

  // 6. Monthly Revenue Trend
  const revenueByMonth = filteredSales.reduce((acc, sale) => {
    const month = new Date(sale.created_at).toLocaleDateString('en-RW', { month: 'short', year: 'numeric' })
    acc[month] = (acc[month] || 0) + (sale.total || 0)
    return acc
  }, {})
  const monthlyData = Object.entries(revenueByMonth).map(([month, total]) => ({ month, total }))

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

  const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0)
  const totalItemsSold = filteredItems.reduce((sum, i) => sum + (i.quantity_sold || 0), 0)
  const totalSalesCount = filteredSales.length

  const handleExport = () => {
    const exportSales = sales.filter(s => {
      const d = new Date(s.created_at)
      const from = exportFrom ? d >= new Date(exportFrom) : true
      const to = exportTo ? d <= new Date(exportTo + 'T23:59:59') : true
      return from && to
    })
    const exportIds = exportSales.map(s => s.id)
    const exportItems = saleItems.filter(i => exportIds.includes(i.sale_id))
    const expRevenue = exportSales.reduce((sum, s) => sum + (s.total || 0), 0)

    const expProductQty = exportItems.reduce((acc, item) => {
      acc[item.product_name] = (acc[item.product_name] || 0) + (item.quantity_sold || 0)
      return acc
    }, {})
    const expBestSelling = Object.entries(expProductQty)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)

    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('KaySales Management System', 14, 15)
    doc.setFontSize(12)
    doc.text('Analysis Report', 14, 25)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 32)
    if (exportFrom || exportTo) {
      doc.text(`Period: ${exportFrom || 'beginning'} to ${exportTo || 'today'}`, 14, 39)
    }
    doc.text(`Total Revenue: RWF ${expRevenue.toLocaleString()}`, 14, 46)
    doc.text(`Total Sales: ${exportSales.length}`, 14, 53)
    doc.text(`Total Items Sold: ${exportItems.reduce((sum, i) => sum + (i.quantity_sold || 0), 0)}`, 14, 60)

    doc.setFontSize(12)
    doc.text('Best Selling Products', 14, 72)
    autoTable(doc, {
      startY: 77,
      head: [['Product', 'Quantity Sold']],
      body: expBestSelling.map(p => [p.name, p.qty]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [29, 78, 216] },
    })

    doc.save(`KaySales_Analysis_${exportFrom || 'all'}_to_${exportTo || 'all'}.pdf`)
    setShowExportModal(false)
    setExportFrom('')
    setExportTo('')
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-gray-400">Loading analysis...</p>
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
            <h1 className="text-2xl font-bold text-white">📈 Analysis</h1>
            <p className="text-gray-400 text-sm mt-1">
              Visual insights from your sales data
              {isPremium && <span className="ml-2 text-xs bg-purple-800 text-purple-300 px-2 py-0.5 rounded-full">⭐ Premium</span>}
            </p>
          </div>
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium"
          >
            📄 Export PDF
          </button>
        </div>

        {/* Date Filter */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-sm">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-sm">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => {
              const d = new Date()
              d.setDate(d.getDate() - 30)
              setDateFrom(d.toISOString().split('T')[0])
              setDateTo(new Date().toISOString().split('T')[0])
            }}
            className="px-3 py-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg text-sm transition"
          >
            Last 30 Days
          </button>
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="px-3 py-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg text-sm transition"
          >
            All Time
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Revenue', value: `RWF ${totalRevenue.toLocaleString()}`, icon: '💵' },
            { label: 'Total Sales', value: totalSalesCount, icon: '🧾' },
            { label: 'Items Sold', value: totalItemsSold, icon: '📦' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-xl font-bold text-white mt-2">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Chart 1 — Revenue Over Time */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">📈 Revenue Over Time</h2>
          {revenueChartData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 2 — Best Selling Products */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">🏆 Best Selling Products</h2>
          {bestSellingData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bestSellingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value) => [value, 'Units Sold']}
                />
                <Bar dataKey="qty" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 3 & 4 — Revenue by Product + Daily Sales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Revenue by Product */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">💰 Revenue by Product</h2>
            {revenueByProductData.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={revenueByProductData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {revenueByProductData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Daily Sales Count */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">📅 Daily Sales Count</h2>
            {dailySalesData.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailySalesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(value) => [value, 'Sales']}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* PREMIUM CHARTS */}
        {isPremium && (
          <>
            {/* Chart 5 — Best Selling Day of Week */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-1">📆 Best Selling Day of Week <span className="text-xs bg-purple-800 text-purple-300 px-2 py-0.5 rounded-full ml-2">⭐ Premium</span></h2>
              <p className="text-gray-400 text-xs mb-4">Which day of the week brings most revenue</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dayOfWeekData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="day" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 6 — Monthly Revenue Trend */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-1">📊 Monthly Revenue Trend <span className="text-xs bg-purple-800 text-purple-300 px-2 py-0.5 rounded-full ml-2">⭐ Premium</span></h2>
              <p className="text-gray-400 text-xs mb-4">Month by month revenue comparison</p>
              {monthlyData.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Line type="monotone" dataKey="total" stroke="#ec4899" strokeWidth={2} dot={{ fill: '#ec4899' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}

      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">📄 Export PDF Report</h2>
              <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-gray-400 text-sm">Select date range. Leave blank to export all data.</p>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">From Date</label>
                <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">To Date</label>
                <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowExportModal(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">Cancel</button>
                <button onClick={handleExport} className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg transition font-medium">Download</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}