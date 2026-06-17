import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    totalSales: 0,
    totalRevenue: 0,
    totalProducts: 0,
    lowStockProducts: [],
    recentSales: [],
  })
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState(null)
  const [selectedSale, setSelectedSale] = useState(null)
  const [receiptItems, setReceiptItems] = useState([])
  const [loadingReceipt, setLoadingReceipt] = useState(false)

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

    const { data: salesData } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', profile.id)

    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', profile.id)

    const totalRevenue = salesData?.reduce((sum, s) => sum + (s.total || 0), 0) || 0
    const lowStock = productsData?.filter(p => p.quantity < 3) || []
    const recentSales = salesData?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10) || []

    setStats({
      totalSales: salesData?.length || 0,
      totalRevenue,
      totalProducts: productsData?.length || 0,
      lowStockProducts: lowStock,
      recentSales,
    })
    setLoading(false)
  }

  const getDaysRemaining = () => {
    if (!subscription?.expiry_date) return null
    const today = new Date()
    const expiry = new Date(subscription.expiry_date)
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
  }

  const daysRemaining = getDaysRemaining()

  const openSaleReceipt = async (sale) => {
    setSelectedSale(sale)
    setLoadingReceipt(true)
    const { data: items } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', sale.id)
    setReceiptItems(items || [])
    setLoadingReceipt(false)
  }

  const printReceipt = () => {
    const doc = new jsPDF({ format: [80, 200], unit: 'mm' })
    doc.setFontSize(12)
    doc.text('KaySales Management System', 40, 10, { align: 'center' })
    doc.setFontSize(9)
    doc.text('Sales Receipt', 40, 16, { align: 'center' })
    doc.text('--------------------------------', 40, 20, { align: 'center' })
    doc.text(`Date: ${new Date(selectedSale.created_at).toLocaleDateString()}`, 5, 26)
    doc.text(`Customer: ${selectedSale.product_name}`, 5, 32)
    doc.text('--------------------------------', 40, 36, { align: 'center' })

    let y = 42
    receiptItems.forEach((item, i) => {
      doc.text(`${i + 1}. ${item.product_name}`, 5, y)
      doc.text(`   Qty: ${item.quantity_sold} x RWF ${item.selling_price?.toLocaleString()}`, 5, y + 5)
      doc.text(`   Total: RWF ${item.total?.toLocaleString()}`, 5, y + 10)
      y += 16
    })

    doc.text('--------------------------------', 40, y, { align: 'center' })
    doc.setFontSize(11)
    doc.text(`GRAND TOTAL: RWF ${selectedSale.total?.toLocaleString()}`, 40, y + 7, { align: 'center' })
    doc.setFontSize(8)
    doc.text('Thank you for your business!', 40, y + 14, { align: 'center' })
    doc.text('Powered by KaySales', 40, y + 19, { align: 'center' })
    doc.save(`Receipt_${selectedSale.product_name}_${new Date(selectedSale.created_at).toLocaleDateString()}.pdf`)
  }

  const exportExcel = () => {
    const data = stats.recentSales.map(s => ({
      Customer: s.product_name,
      'Total (RWF)': s.total,
      Date: new Date(s.created_at).toLocaleDateString(),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales')
    XLSX.writeFile(wb, 'KaySales_Dashboard_Report.xlsx')
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('KaySales Management System', 14, 15)
    doc.setFontSize(12)
    doc.text('Dashboard Report', 14, 25)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 32)
    doc.text(`Total Revenue: RWF ${stats.totalRevenue.toLocaleString()}`, 14, 39)
    doc.text(`Total Sales: ${stats.totalSales}`, 14, 46)

    autoTable(doc, {
      startY: 55,
      head: [['Customer', 'Total (RWF)', 'Date']],
      body: stats.recentSales.map(s => [
        s.product_name,
        s.total?.toLocaleString(),
        new Date(s.created_at).toLocaleDateString(),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [29, 78, 216] },
    })
    doc.save('KaySales_Dashboard_Report.pdf')
  }

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
          <div className="flex items-center gap-3">
            <p className="text-gray-400 text-sm hidden sm:block">
              {new Date().toLocaleDateString('en-RW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <button onClick={exportExcel} className="px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm transition font-medium">Excel</button>
            <button onClick={exportPDF} className="px-3 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium">PDF</button>
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

        {/* Recent Sales */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Recent Sales</h2>
            <button onClick={() => navigate('/sales')} className="text-blue-400 hover:text-blue-300 text-sm transition">
              View All →
            </button>
          </div>

          {stats.recentSales.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No sales recorded yet</p>
              <button onClick={() => navigate('/sales')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
                Record First Sale
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-400 pb-3 font-medium">Customer</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Total</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Date</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSales.map((sale) => (
                    <tr key={sale.id} className="border-b border-gray-800 hover:bg-gray-800 transition cursor-pointer">
                      <td className="py-3 text-white font-medium">{sale.product_name}</td>
                      <td className="py-3 text-green-400 font-medium">RWF {sale.total?.toLocaleString()}</td>
                      <td className="py-3 text-gray-400">{new Date(sale.created_at).toLocaleDateString()}</td>
                      <td className="py-3">
                        <button
                          onClick={() => openSaleReceipt(sale)}
                          className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition"
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Receipt Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl max-h-screen flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Sales Receipt</h2>
              <button onClick={() => setSelectedSale(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto">
              <div className="text-center mb-4">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <span className="text-white font-bold">K</span>
                </div>
                <p className="text-white font-bold">KaySales Management System</p>
                <p className="text-gray-400 text-xs">Sales Receipt</p>
              </div>
              <div className="border-t border-gray-700 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Date</span>
                  <span className="text-white">{new Date(selectedSale.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Customer</span>
                  <span className="text-white">{selectedSale.product_name}</span>
                </div>
                <div className="border-t border-gray-700 pt-2">
                  <p className="text-gray-400 text-xs mb-2">Items:</p>
                  {loadingReceipt ? (
                    <p className="text-gray-400 text-sm text-center py-2">Loading...</p>
                  ) : receiptItems.length > 0 ? (
                    receiptItems.map((item, i) => (
                      <div key={i} className="mb-2">
                        <p className="text-white text-sm">{item.product_name}</p>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>{item.quantity_sold} x RWF {item.selling_price?.toLocaleString()}</span>
                          <span className="text-green-400">RWF {item.total?.toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-400 text-sm">No items found</p>
                  )}
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between">
                  <span className="text-white font-bold">GRAND TOTAL</span>
                  <span className="text-green-400 font-bold text-lg">RWF {selectedSale.total?.toLocaleString()}</span>
                </div>
              </div>
              <div className="text-center mt-4 text-gray-500 text-xs">
                <p>Thank you for your business!</p>
                <p>Powered by KaySales</p>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setSelectedSale(null)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">
                  Close
                </button>
                <button onClick={printReceipt} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}