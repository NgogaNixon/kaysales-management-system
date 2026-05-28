import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Analysis() {
  const { profile } = useAuth()
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

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

    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', profile.id)

    setSales(salesData || [])
    setProducts(productsData || [])
    setLoading(false)
  }

  const filtered = sales.filter(s => {
    const saleDate = new Date(s.created_at)
    const matchesFrom = dateFrom ? saleDate >= new Date(dateFrom) : true
    const matchesTo = dateTo ? saleDate <= new Date(dateTo + 'T23:59:59') : true
    return matchesFrom && matchesTo
  })

  // Revenue by day
  const revenueByDay = filtered.reduce((acc, sale) => {
    const date = new Date(sale.created_at).toLocaleDateString()
    acc[date] = (acc[date] || 0) + (sale.total || 0)
    return acc
  }, {})
  const revenueChartData = Object.entries(revenueByDay).map(([date, total]) => ({ date, total }))

  // Best selling products
  const productSales = filtered.reduce((acc, sale) => {
    acc[sale.product_name] = (acc[sale.product_name] || 0) + (sale.quantity_sold || 0)
    return acc
  }, {})
  const productChartData = Object.entries(productSales)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  // Revenue by product
  const revenueByProduct = filtered.reduce((acc, sale) => {
    acc[sale.product_name] = (acc[sale.product_name] || 0) + (sale.total || 0)
    return acc
  }, {})
  const pieData = Object.entries(revenueByProduct)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

  const totalRevenue = filtered.reduce((sum, s) => sum + (s.total || 0), 0)
  const totalSales = filtered.length
  const avgSale = totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('KaySales Management System', 14, 15)
    doc.setFontSize(12)
    doc.text('Analysis Report', 14, 25)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 32)
    doc.text(`Total Revenue: RWF ${totalRevenue.toLocaleString()}`, 14, 39)
    doc.text(`Total Sales: ${totalSales}`, 14, 46)

    doc.setFontSize(12)
    doc.text('Best Selling Products', 14, 58)
    autoTable(doc, {
      startY: 63,
      head: [['Product', 'Quantity Sold']],
      body: productChartData.map(p => [p.name, p.qty]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [29, 78, 216] },
    })

    doc.save('KaySales_Analysis_Report.pdf')
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
            <p className="text-gray-400 text-sm mt-1">Visual insights from your sales data</p>
          </div>
          <button
            onClick={exportPDF}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium"
          >
            📄 Export PDF
          </button>
        </div>

        {/* Date Filter */}
        <div className="flex gap-3">
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
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="px-3 py-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg text-sm transition"
            >
              Clear
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Revenue', value: `RWF ${totalRevenue.toLocaleString()}`, icon: '💵' },
            { label: 'Total Sales', value: totalSales, icon: '🧾' },
            { label: 'Avg per Sale', value: `RWF ${avgSale.toLocaleString()}`, icon: '📊' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-xl font-bold text-white mt-2">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Revenue Over Time */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">📈 Revenue Over Time</h2>
          {revenueChartData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Best Selling Products & Pie Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Best Sellers Bar Chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">🏆 Best Selling Products</h2>
            {productChartData.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={productChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(value) => [value, 'Units Sold']}
                  />
                  <Bar dataKey="qty" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Revenue by Product Pie Chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">💰 Revenue by Product</h2>
            {pieData.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
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

        </div>

      </div>
    </Layout>
  )
}