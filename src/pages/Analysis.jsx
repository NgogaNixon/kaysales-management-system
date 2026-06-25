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
  const showProfit = profile?.show_profit === true
  const isPremium = profile?.plan_type === 'premium'
  const [saleItems, setSaleItems] = useState([])
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
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

  useEffect(() => {
    if (profile?.id) fetchData()
  }, [profile])

  useEffect(() => {
    const handleFocus = () => {
      if (profile?.id) fetchData(false)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [profile])

  const fetchData = async (showLoader = true) => {
    if (showLoader) setLoading(true)

    const [
      { data: salesData },
      { data: itemsData },
      { data: productsData }
    ] = await Promise.all([
      supabase.from('sales').select('*').eq('user_id', profile.id).order('created_at', { ascending: true }),
      supabase.from('sale_items').select('*').eq('user_id', profile.id),
      supabase.from('products').select('id, name, category').eq('user_id', profile.id),
    ])

    setSales(salesData || [])
    setSaleItems(itemsData || [])
    setProducts(productsData || [])
    setLoading(false)
  }

  // Filter sales by date
  const filteredSales = sales.filter(s => {
    const d = new Date(s.created_at)
    const from = dateFrom ? d >= new Date(dateFrom) : true
    const to = dateTo ? d <= new Date(dateTo + 'T23:59:59') : true
    return from && to
  })

  const filteredSaleIds = filteredSales.map(s => s.id)
  const filteredItems = saleItems.filter(i => filteredSaleIds.includes(i.sale_id))

  // 1. Revenue Over Time (by day)
  const revenueByDay = filteredSales.reduce((acc, sale) => {
    const date = new Date(sale.created_at).toLocaleDateString()
    acc[date] = (acc[date] || 0) + (sale.total || 0)
    return acc
  }, {})
  const revenueChartData = Object.entries(revenueByDay).map(([date, total]) => ({ date, total }))

  // 2. Best Selling Products (by quantity)
  const productQty = filteredItems.reduce((acc, item) => {
    acc[item.product_name] = (acc[item.product_name] || 0) + (item.quantity_sold || 0)
    return acc
  }, {})
  const bestSellingData = Object.entries(productQty)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  // 3. Revenue by Product
  const productRevenue = filteredItems.reduce((acc, item) => {
    acc[item.product_name] = (acc[item.product_name] || 0) + (item.total || 0)
    return acc
  }, {})
  const revenueByProductData = Object.entries(productRevenue)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  // 4. Daily Sales Count
  const salesPerDay = filteredSales.reduce((acc, sale) => {
    const date = new Date(sale.created_at).toLocaleDateString()
    acc[date] = (acc[date] || 0) + 1
    return acc
  }, {})
  const dailySalesData = Object.entries(salesPerDay).map(([date, count]) => ({ date, count }))

  // 5. Payment Method Breakdown
  const paymentBreakdown = filteredSales.reduce((acc, sale) => {
    const method = sale.payment_method || 'cash'
    acc[method] = (acc[method] || 0) + (sale.total || 0)
    return acc
  }, {})
  const paymentMethodData = Object.entries(paymentBreakdown).map(([method, value]) => ({
    name: method === 'mtn' ? 'MTN' :
          method === 'bank' ? 'Bank' :
          method === 'cheque' ? 'Cheque' :
          method === 'credit' ? 'Credit' : 'Cash',
    value
  }))

  // 6. Revenue by Category (using products table)
  const productCategoryMap = products.reduce((acc, p) => {
    acc[p.name] = p.category || 'Uncategorized'
    return acc
  }, {})
  const categoryRevenue = filteredItems.reduce((acc, item) => {
    const category = productCategoryMap[item.product_name] || 'Uncategorized'
    acc[category] = (acc[category] || 0) + (item.total || 0)
    return acc
  }, {})
  const categoryData = Object.entries(categoryRevenue)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // PREMIUM — Best Selling Day of Week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const revenueByDayOfWeek = filteredSales.reduce((acc, sale) => {
    const day = dayNames[new Date(sale.created_at).getDay()]
    acc[day] = (acc[day] || 0) + (sale.total || 0)
    return acc
  }, {})
  const dayOfWeekData = dayNames.map(day => ({ day: day.slice(0, 3), total: revenueByDayOfWeek[day] || 0 }))

  // PREMIUM — Monthly Revenue Trend
  const revenueByMonth = filteredSales.reduce((acc, sale) => {
    const month = new Date(sale.created_at).toLocaleDateString('en-RW', { month: 'short', year: 'numeric' })
    acc[month] = (acc[month] || 0) + (sale.total || 0)
    return acc
  }, {})
  const monthlyData = Object.entries(revenueByMonth).map(([month, total]) => ({ month, total }))

  // Profit over time (show_profit users only)
  const profitByDay = filteredSales.reduce((acc, sale) => {
    if (sale.profit == null) return acc
    const date = new Date(sale.created_at).toLocaleDateString()
    acc[date] = (acc[date] || 0) + (sale.profit || 0)
    return acc
  }, {})
  const profitChartData = Object.entries(profitByDay).map(([date, profit]) => ({ date, profit }))

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

  const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0)
  const totalProfit = filteredSales.reduce((sum, s) => sum + (s.profit || 0), 0)
  const totalItemsSold = filteredItems.reduce((sum, i) => sum + (i.quantity_sold || 0), 0)
  const totalSalesCount = filteredSales.length
  const avgSaleValue = totalSalesCount > 0 ? Math.round(totalRevenue / totalSalesCount) : 0

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
    const expProfit = exportSales.reduce((sum, s) => sum + (s.profit || 0), 0)

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
    if (showProfit) doc.text(`Total Profit: RWF ${expProfit.toLocaleString()}`, 14, 53)
    doc.text(`Total Sales: ${exportSales.length}`, 14, showProfit ? 60 : 53)
    doc.text(`Total Items Sold: ${exportItems.reduce((sum, i) => sum + (i.quantity_sold || 0), 0)}`, 14, showProfit ? 67 : 60)

    doc.setFontSize(12)
    doc.text('Best Selling Products', 14, showProfit ? 79 : 72)
    autoTable(doc, {
      startY: showProfit ? 84 : 77,
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
      <div className="p-4 sm:p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
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
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[130px]"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[130px]"
          />
          <button
            onClick={() => {
              const d = new Date()
              d.setDate(d.getDate() - 30)
              setDateFrom(d.toISOString().split('T')[0])
              setDateTo(new Date().toISOString().split('T')[0])
            }}
            className="px-3 py-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg text-sm transition whitespace-nowrap"
          >
            Last 30 Days
          </button>
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="px-3 py-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg text-sm transition whitespace-nowrap"
          >
            All Time
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Revenue', value: `RWF ${totalRevenue.toLocaleString()}`, icon: '💵', color: 'text-green-400' },
            { label: 'Total Sales', value: totalSalesCount, icon: '🧾', color: 'text-white' },
            { label: 'Items Sold', value: totalItemsSold, icon: '📦', color: 'text-white' },
            { label: 'Avg Sale Value', value: `RWF ${avgSaleValue.toLocaleString()}`, icon: '📊', color: 'text-blue-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className={`text-lg font-bold mt-2 ${stat.color}`}>{stat.value}</p>
              <p className="text-gray-400 text-xs mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Profit stat for show_profit users */}
        {showProfit && (
          <div className="bg-purple-900 border border-purple-700 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-purple-400 text-sm">Total Profit (selected period)</p>
              <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-purple-300' : 'text-red-400'}`}>
                RWF {totalProfit.toLocaleString()}
              </p>
            </div>
            <span className="text-4xl">💎</span>
          </div>
        )}

        {/* Chart 1 — Revenue Over Time */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-bold text-white mb-4">📈 Revenue Over Time</h2>
          {revenueChartData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={70} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 2 — Best Selling Products */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-bold text-white mb-4">🏆 Best Selling Products</h2>
          {bestSellingData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bestSellingData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 9 }} width={90} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value) => [value, 'Units Sold']}
                />
                <Bar dataKey="qty" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 3 & 4 — Revenue by Product + Payment Methods */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Revenue by Product */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
            <h2 className="text-lg font-bold text-white mb-4">💰 Revenue by Product</h2>
            {revenueByProductData.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={revenueByProductData}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {revenueByProductData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Payment Method Breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
            <h2 className="text-lg font-bold text-white mb-4">💳 Payment Methods</h2>
            {paymentMethodData.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Revenue by Category */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-bold text-white mb-4">🗂️ Revenue by Category</h2>
          {categoryData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 9 }} width={90} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                />
                <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Profit Over Time — show_profit users only */}
        {showProfit && profitChartData.length > 0 && (
          <div className="bg-gray-900 border border-purple-800 rounded-xl p-4 sm:p-6">
            <h2 className="text-lg font-bold text-white mb-1">💎 Profit Over Time</h2>
            <p className="text-gray-400 text-xs mb-4">Daily profit trend</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={profitChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={70} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Profit']}
                />
                <Line type="monotone" dataKey="profit" stroke="#a855f7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Daily Sales Count */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-bold text-white mb-4">📅 Daily Sales Count</h2>
          {dailySalesData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={30} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value) => [value, 'Sales']}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* PREMIUM CHARTS */}
        {isPremium ? (
          <>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
              <h2 className="text-lg font-bold text-white mb-1">
                📆 Best Selling Day of Week
                <span className="text-xs bg-purple-800 text-purple-300 px-2 py-0.5 rounded-full ml-2">⭐ Premium</span>
              </h2>
              <p className="text-gray-400 text-xs mb-4">Which day of the week brings most revenue</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dayOfWeekData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="day" stroke="#9ca3af" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={70} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
              <h2 className="text-lg font-bold text-white mb-1">
                📊 Monthly Revenue Trend
                <span className="text-xs bg-purple-800 text-purple-300 px-2 py-0.5 rounded-full ml-2">⭐ Premium</span>
              </h2>
              <p className="text-gray-400 text-xs mb-4">Month by month revenue comparison</p>
              {monthlyData.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" stroke="#9ca3af" tick={{ fontSize: 9 }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={70} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Line type="monotone" dataKey="total" stroke="#ec4899" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        ) : (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center">
            <span className="text-4xl">⭐</span>
            <h3 className="text-white font-bold text-lg mt-3">Unlock Premium Charts</h3>
            <p className="text-gray-400 text-sm mt-2">Upgrade to Premium to access Day of Week analysis and Monthly Revenue Trend charts.</p>
            <p className="text-gray-500 text-xs mt-2">Contact admin to upgrade your plan.</p>
          </div>
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