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
  const showProfit = profile?.show_profit === true
  const [stats, setStats] = useState({
    totalSales: 0,
    totalRevenue: 0,
    totalProfit: 0,
    stockValueCost: 0,
    stockValueSelling: 0,
    totalProducts: 0,
    lowStockProducts: [],
    recentSales: [],
  })
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState(null)
  const [selectedSale, setSelectedSale] = useState(null)
  const [receiptItems, setReceiptItems] = useState([])
  const [loadingReceipt, setLoadingReceipt] = useState(false)
  const [manualExpenses, setManualExpenses] = useState(0)
  const [expenseList, setExpenseList] = useState([])
  const [allSales, setAllSales] = useState([])
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showExpenseHistory, setShowExpenseHistory] = useState(false)
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [savingExpense, setSavingExpense] = useState(false)

  useEffect(() => {
    if (profile?.id) {
      fetchDashboardData()
      fetchSubscription()
      fetchExpenses()
    }
  }, [profile])

  const fetchExpenses = async () => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    setExpenseList(data || [])
    const sum = (data || []).reduce((s, e) => s + (e.amount || 0), 0)
    setManualExpenses(sum)
  }

  const handleDeleteExpense = async (id) => {
    await supabase.from('expenses').delete().eq('id', id)
    fetchExpenses()
  }

  const handleAddExpense = async () => {
    if (!expenseDesc || !expenseAmount) return
    setSavingExpense(true)
    await supabase.from('expenses').insert({
      user_id: profile.id,
      description: expenseDesc,
      amount: parseInt(expenseAmount) || 0,
    })
    setExpenseDesc('')
    setExpenseAmount('')
    setSavingExpense(false)
    setShowExpenseModal(false)
    fetchExpenses()
  }

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
    const totalProfit = salesData?.reduce((sum, s) => sum + (s.profit || 0), 0) || 0
    const stockValueCost = productsData?.reduce((sum, p) => sum + ((p.buying_price || 0) * (p.quantity || 0)), 0) || 0
    const stockValueSelling = productsData?.reduce((sum, p) => sum + ((p.selling_price || 0) * (p.quantity || 0)), 0) || 0
    const lowStock = productsData?.filter(p => p.quantity < 3) || []
    const recentSales = salesData?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10) || []
    setAllSales(salesData || [])

    setStats({
      totalSales: salesData?.length || 0,
      totalRevenue,
      totalProfit,
      stockValueCost,
      stockValueSelling,
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
    const paymentLabel = selectedSale.payment_method === 'mtn' ? 'MTN Mobile Money' :
      selectedSale.payment_method === 'bank' ? 'Bank Transfer' :
      selectedSale.payment_method === 'cheque' ? 'Cheque' :
      selectedSale.payment_method === 'credit' ? 'Credit' : 'Cash'
    doc.text(`Payment: ${paymentLabel} (${selectedSale.payment_status === 'paid' ? 'Paid' : 'Pending'})`, 5, 38)
    doc.text('--------------------------------', 40, 42, { align: 'center' })

    let y = 48
    receiptItems.forEach((item, i) => {
      doc.text(`${i + 1}. ${item.product_name}`, 5, y)
      doc.text(`   Qty: ${item.quantity_sold} x RWF ${item.selling_price?.toLocaleString()}`, 5, y + 5)
      doc.text(`   Total: RWF ${item.total?.toLocaleString()}`, 5, y + 10)
      y += 16
    })

    doc.text('--------------------------------', 40, y, { align: 'center' })
    doc.setFontSize(11)
    doc.text(`GRAND TOTAL: RWF ${selectedSale.total?.toLocaleString()}`, 40, y + 7, { align: 'center' })
    let footerY = y + 7

    if (showProfit && (selectedSale.extra_fees || selectedSale.profit !== undefined)) {
      doc.setFontSize(8)
      if (selectedSale.extra_fees) {
        footerY += 6
        doc.text(`Extra Fees: -RWF ${selectedSale.extra_fees.toLocaleString()}`, 40, footerY, { align: 'center' })
        footerY += 5
        doc.text(`Remaining: RWF ${(selectedSale.total - selectedSale.extra_fees).toLocaleString()}`, 40, footerY, { align: 'center' })
      }
      if (selectedSale.profit !== undefined && selectedSale.profit !== null) {
        footerY += 5
        doc.text(`Profit Made: RWF ${selectedSale.profit.toLocaleString()}`, 40, footerY, { align: 'center' })
      }
    }

    doc.setFontSize(8)
    doc.text('Thank you for your business!', 40, footerY + 7, { align: 'center' })
    doc.text('Powered by KaySales', 40, footerY + 12, { align: 'center' })
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

  const cogs = Math.max(stats.totalRevenue - stats.totalProfit, 0)
  const vat = Math.round(stats.totalRevenue * 0.18)
  const netProfit = stats.totalRevenue - (cogs + manualExpenses) - vat

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
            <button
              onClick={() => navigate('/choose-plan')}
              className={`px-4 py-2 rounded-lg font-bold text-sm ${daysRemaining <= 3 ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'} transition`}
            >
              Top Up Now
            </button>
          </div>
        )}

        {/* Esther Special Cards */}
        {showProfit && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Financial Breakdown</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowExpenseHistory(true)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition"
                >
                  📋 Expense History
                </button>
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-xs transition"
                >
                  + Add Expense
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <span className="text-2xl">💰</span>
                <p className="text-white text-2xl font-bold mt-2">RWF {stats.totalRevenue.toLocaleString()}</p>
                <p className="text-gray-400 text-sm mt-1">Total (Revenue)</p>
                <p className="text-gray-500 text-xs mt-1">= Sum of every sale's total, including unpaid credit sales</p>
              </div>
              <div
                onClick={() => setShowExpenseHistory(true)}
                className="bg-orange-900 border border-orange-700 rounded-xl p-4 cursor-pointer hover:border-orange-500 transition"
              >
                <span className="text-2xl">📉</span>
                <p className="text-orange-300 text-2xl font-bold mt-2">RWF {(cogs + manualExpenses).toLocaleString()}</p>
                <p className="text-orange-400 text-sm mt-1">Expenses (Cost of Goods + Operating)</p>
                <p className="text-orange-500 text-xs mt-1">= (Total − Total Profit) + Manual Expenses</p>
                <p className="text-orange-500 text-xs mt-1 underline">Click to see full breakdown</p>
              </div>
              <div className="bg-yellow-900 border border-yellow-700 rounded-xl p-4">
                <span className="text-2xl">🧾</span>
                <p className="text-yellow-300 text-2xl font-bold mt-2">RWF {vat.toLocaleString()}</p>
                <p className="text-yellow-400 text-sm mt-1">VAT (18%)</p>
                <p className="text-yellow-500 text-xs mt-1">= Total Revenue × 18%</p>
              </div>
              <div className="bg-purple-900 border border-purple-700 rounded-xl p-4">
                <span className="text-2xl">💎</span>
                <p className="text-purple-300 text-2xl font-bold mt-2">RWF {netProfit.toLocaleString()}</p>
                <p className="text-purple-400 text-sm mt-1">Profit (after Expenses & VAT)</p>
                <p className="text-purple-500 text-xs mt-1">= Total − Expenses − VAT</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-blue-900 border border-blue-700 rounded-xl p-4">
                <span className="text-2xl">📦</span>
                <p className="text-blue-300 text-2xl font-bold mt-2">RWF {stats.stockValueCost.toLocaleString()}</p>
                <p className="text-blue-400 text-sm mt-1">Stock Value (Cost)</p>
                <p className="text-blue-500 text-xs mt-1">= Σ (buying price × quantity) across unsold stock</p>
              </div>
              <div className="bg-green-900 border border-green-700 rounded-xl p-4">
                <span className="text-2xl">💰</span>
                <p className="text-green-300 text-2xl font-bold mt-2">RWF {stats.stockValueSelling.toLocaleString()}</p>
                <p className="text-green-400 text-sm mt-1">Stock Value (Selling Price)</p>
                <p className="text-green-500 text-xs mt-1">= Σ (selling price × quantity) across unsold stock</p>
              </div>
            </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl max-h-full flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Sales Receipt</h2>
              <button onClick={() => setSelectedSale(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
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
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Payment Method</span>
                  <span className="text-white">
                    {selectedSale.payment_method === 'mtn' ? '📱 MTN Mobile Money' :
                     selectedSale.payment_method === 'bank' ? '🏦 Bank Transfer' :
                     selectedSale.payment_method === 'cheque' ? '📄 Cheque' :
                     selectedSale.payment_method === 'credit' ? '💳 Credit' : '💵 Cash'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Payment Status</span>
                  <span className={selectedSale.payment_status === 'paid' ? 'text-green-400 font-medium' : 'text-orange-400 font-medium'}>
                    {selectedSale.payment_status === 'paid' ? '✅ Paid' : '⏳ Pending'}
                  </span>
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
                {showProfit && selectedSale.extra_fees > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Extra Fees</span>
                      <span className="text-red-400">- RWF {selectedSale.extra_fees.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Remaining</span>
                      <span className="text-white font-medium">RWF {(selectedSale.total - selectedSale.extra_fees).toLocaleString()}</span>
                    </div>
                  </>
                )}
                {showProfit && selectedSale.profit !== undefined && selectedSale.profit !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Profit Made</span>
                    <span className="text-purple-400 font-medium">RWF {selectedSale.profit.toLocaleString()}</span>
                  </div>
                )}
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

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">Add Expense</h2>
              <button onClick={() => setShowExpenseModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Description</label>
                <input
                  type="text"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Rent, Salaries, Transport"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Amount (RWF)</label>
                <input
                  type="number"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  placeholder="0"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowExpenseModal(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">Cancel</button>
                <button onClick={handleAddExpense} disabled={savingExpense} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
                  {savingExpense ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense History Modal */}
      {showExpenseHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Expense Breakdown</h2>
              <button onClick={() => setShowExpenseHistory(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-5">

              {/* Cost of Goods */}
              <div>
                <p className="text-white font-bold text-sm mb-1">Cost of Goods Sold — RWF {cogs.toLocaleString()}</p>
                <p className="text-gray-500 text-xs mb-3">Per sale: (Revenue − Profit). Sum of the column below = the total above.</p>
                {allSales.length === 0 ? (
                  <p className="text-gray-500 text-sm">No sales recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {allSales
                      .slice()
                      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                      .map((s) => {
                        const saleCost = (s.total || 0) - (s.profit || 0)
                        return (
                          <div key={s.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                            <div>
                              <p className="text-white text-sm">{s.product_name}</p>
                              <p className="text-gray-500 text-xs">
                                {new Date(s.created_at).toLocaleDateString()} · Revenue RWF {(s.total || 0).toLocaleString()} − Profit RWF {(s.profit || 0).toLocaleString()}
                              </p>
                            </div>
                            <span className="text-orange-300 text-sm font-medium">RWF {saleCost.toLocaleString()}</span>
                          </div>
                        )
                      })}
                  </div>
                )}
                <button
                  onClick={() => navigate('/sales')}
                  className="text-blue-400 hover:text-blue-300 text-xs underline mt-2 inline-block"
                >
                  Go to Sales page for full item-level detail →
                </button>
              </div>

              {/* Manual Operating Expenses */}
              <div className="border-t border-gray-800 pt-4">
                <p className="text-white font-bold text-sm mb-2">Operating Expenses — RWF {manualExpenses.toLocaleString()}</p>
                {expenseList.length === 0 ? (
                  <p className="text-gray-500 text-sm">No manual expenses logged yet.</p>
                ) : (
                  <div className="space-y-2">
                    {expenseList.map((e) => (
                      <div key={e.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-white text-sm">{e.description}</p>
                          <p className="text-gray-500 text-xs">{new Date(e.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-orange-300 text-sm font-medium">RWF {e.amount.toLocaleString()}</span>
                          <button
                            onClick={() => handleDeleteExpense(e.id)}
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0">
              <button
                onClick={() => { setShowExpenseHistory(false); setShowExpenseModal(true) }}
                className="w-full py-2 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition"
              >
                + Add New Expense
              </button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}