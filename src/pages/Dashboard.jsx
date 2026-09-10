import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawBrandedHeaderNarrow, drawSignatureAndStampNarrow, estimateNarrowReceiptHeight } from '../lib/pdfBranding'

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
  const [expenseList, setExpenseList] = useState([])
  const [allSales, setAllSales] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showExpenseHistory, setShowExpenseHistory] = useState(false)
  const [showRevenueBreakdown, setShowRevenueBreakdown] = useState(false)
  const [showProfitBreakdown, setShowProfitBreakdown] = useState(false)
  const [showStockBreakdown, setShowStockBreakdown] = useState(false)
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [savingExpense, setSavingExpense] = useState(false)
  const [periodPreset, setPeriodPreset] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // A product's own low_stock_threshold if set, otherwise the app default of 3.
  const thresholdFor = (product) => product?.low_stock_threshold || 3

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
    const lowStock = productsData?.filter(p => p.quantity < thresholdFor(p)) || []
    const recentSales = salesData?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10) || []
    setAllSales(salesData || [])
    setAllProducts(productsData || [])

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

  const printReceipt = async () => {
    const pageHeight = estimateNarrowReceiptHeight(profile, receiptItems.length)
    const doc = new jsPDF({ format: [80, pageHeight], unit: 'mm' })

    let y = await drawBrandedHeaderNarrow(doc, profile)

    doc.text('Sales Receipt', 40, y, { align: 'center' })
    y += 4
    doc.text('--------------------------------', 40, y, { align: 'center' })
    y += 6
    doc.text(`Date: ${new Date(selectedSale.created_at).toLocaleDateString()}`, 5, y)
    y += 6
    doc.text(`Customer: ${selectedSale.product_name}`, 5, y)
    y += 6
    const paymentLabel = selectedSale.payment_method === 'mtn' ? 'MTN Mobile Money' :
      selectedSale.payment_method === 'bank' ? 'Bank Transfer' :
      selectedSale.payment_method === 'cheque' ? 'Cheque' :
      selectedSale.payment_method === 'credit' ? 'Credit' : 'Cash'
    doc.text(`Payment: ${paymentLabel} (${selectedSale.payment_status === 'paid' ? 'Paid' : 'Pending'})`, 5, y)
    y += 4
    doc.text('--------------------------------', 40, y, { align: 'center' })
    y += 6

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

    footerY = await drawSignatureAndStampNarrow(doc, profile, footerY + 4)

    doc.setFontSize(8)
    doc.text('Thank you for your business!', 40, footerY, { align: 'center' })
    doc.text('Powered by KaySales', 40, footerY + 5, { align: 'center' })
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
    doc.text(profile?.company_name || 'KaySales Management System', 14, 15)
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

  const getPeriodBounds = () => {
    const now = new Date()
    if (periodPreset === 'all') return { start: null, end: null }
    if (periodPreset === 'custom') {
      return {
        start: customFrom ? new Date(customFrom) : null,
        end: customTo ? new Date(customTo + 'T23:59:59') : null,
      }
    }
    if (periodPreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      return { start, end }
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    return { start, end }
  }
  const { start: periodStart, end: periodEnd } = getPeriodBounds()

  const inPeriod = (dateStr) => {
    const d = new Date(dateStr)
    if (periodStart && d < periodStart) return false
    if (periodEnd && d > periodEnd) return false
    return true
  }

  const periodSales = allSales.filter(s => inPeriod(s.created_at))
  const periodExpenseList = expenseList.filter(e => inPeriod(e.created_at))
  const periodRevenue = periodSales.reduce((sum, s) => sum + (s.total || 0), 0)
  const periodProfitSum = periodSales.reduce((sum, s) => sum + (s.profit || 0), 0)
  const periodManualExpenses = periodExpenseList.reduce((sum, e) => sum + (e.amount || 0), 0)
  const cogs = Math.max(periodRevenue - periodProfitSum, 0)
  const netProfit = periodRevenue - (cogs + periodManualExpenses)

  const periodLabel = periodPreset === 'today'
    ? 'Today'
    : periodPreset === 'month'
    ? new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : periodPreset === 'all'
    ? 'All Time'
    : `${customFrom || '…'} to ${customTo || '…'}`

  return (
    <Layout>
      <div className="p-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {profile?.full_name?.split(' ')[0]}
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

        {daysRemaining !== null && daysRemaining <= 7 && (
          <div className={`rounded-xl p-4 flex items-center justify-between ${daysRemaining <= 3 ? 'bg-red-900 border border-red-700' : 'bg-yellow-900 border border-yellow-700'}`}>
            <div className="flex items-center gap-3">
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

        {showProfit && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-white font-bold">Financial Breakdown — {periodLabel}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowExpenseHistory(true)}
                  className="px-3 py-1.5 bg-surface-elevated hover:bg-surface-border border border-surface-border text-white rounded-lg text-xs transition"
                >
                  Expense History
                </button>
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-xs transition"
                >
                  + Add Expense
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {[
                { key: 'today', label: 'Today' },
                { key: 'month', label: 'This Month' },
                { key: 'all', label: 'All Time' },
                { key: 'custom', label: 'Custom Range' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setPeriodPreset(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    periodPreset === opt.key ? 'bg-primary text-white' : 'bg-surface-elevated text-gray-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {periodPreset === 'custom' && (
                <>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="bg-surface-elevated border border-surface-border text-white px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-primary"
                  />
                  <span className="text-gray-500 text-xs">to</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="bg-surface-elevated border border-surface-border text-white px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-primary"
                  />
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div
                onClick={() => setShowRevenueBreakdown(true)}
                className="bg-surface-elevated border border-surface-border border-l-4 border-l-primary rounded-xl p-4 cursor-pointer hover:border-l-primary-light transition"
              >
                <p className="text-white text-2xl font-bold">RWF {periodRevenue.toLocaleString()}</p>
                <p className="text-gray-400 text-sm mt-1">Total (Revenue)</p>
                <p className="text-gray-500 text-xs mt-1">= Sum of sales in {periodLabel}, including unpaid credit sales</p>
                <p className="text-primary-light text-xs mt-1 underline">Click to see full breakdown</p>
              </div>
              <div
                onClick={() => setShowExpenseHistory(true)}
                className="bg-surface-elevated border border-surface-border border-l-4 border-l-orange-500 rounded-xl p-4 cursor-pointer hover:border-l-orange-400 transition"
              >
                <p className="text-orange-300 text-2xl font-bold">RWF {(cogs + periodManualExpenses).toLocaleString()}</p>
                <p className="text-orange-400 text-sm mt-1">Expenses (Cost of Goods + Operating)</p>
                <p className="text-orange-500 text-xs mt-1">= (Revenue − Profit) + Manual Expenses, for {periodLabel}</p>
                <p className="text-orange-400 text-xs mt-1 underline">Click to see full breakdown</p>
              </div>
              <div
                onClick={() => setShowProfitBreakdown(true)}
                className="bg-surface-elevated border border-surface-border border-l-4 border-l-purple-500 rounded-xl p-4 cursor-pointer hover:border-l-purple-400 transition"
              >
                <p className="text-purple-300 text-2xl font-bold">RWF {netProfit.toLocaleString()}</p>
                <p className="text-purple-400 text-sm mt-1">Profit (after Expenses)</p>
                <p className="text-purple-500 text-xs mt-1">= Total − Expenses, for {periodLabel}</p>
                <p className="text-purple-400 text-xs mt-1 underline">Click to see full breakdown</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => setShowStockBreakdown(true)}
                className="bg-surface-elevated border border-surface-border border-l-4 border-l-cyan-500 rounded-xl p-4 cursor-pointer hover:border-l-cyan-400 transition"
              >
                <p className="text-cyan-300 text-2xl font-bold">RWF {stats.stockValueCost.toLocaleString()}</p>
                <p className="text-cyan-400 text-sm mt-1">Stock Value (Cost)</p>
                <p className="text-cyan-500 text-xs mt-1">= Σ (buying price × quantity) across unsold stock</p>
                <p className="text-cyan-400 text-xs mt-1 underline">Click to see full breakdown</p>
              </div>
              <div
                onClick={() => setShowStockBreakdown(true)}
                className="bg-surface-elevated border border-surface-border border-l-4 border-l-green-500 rounded-xl p-4 cursor-pointer hover:border-l-green-400 transition"
              >
                <p className="text-green-300 text-2xl font-bold">RWF {stats.stockValueSelling.toLocaleString()}</p>
                <p className="text-green-400 text-sm mt-1">Stock Value (Selling Price)</p>
                <p className="text-green-500 text-xs mt-1">= Σ (selling price × quantity) across unsold stock</p>
                <p className="text-green-400 text-xs mt-1 underline">Click to see full breakdown</p>
              </div>
            </div>
          </div>
        )}

        {stats.lowStockProducts.length > 0 && (
          <div className="bg-orange-900 border border-orange-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
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

        <div className="bg-surface-elevated border border-surface-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Recent Sales</h2>
            <button onClick={() => navigate('/sales')} className="text-primary-light hover:text-primary text-sm transition">
              View All →
            </button>
          </div>

          {stats.recentSales.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No sales recorded yet</p>
              <button onClick={() => navigate('/sales')} className="mt-3 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition">
                Record First Sale
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="text-left text-gray-400 pb-3 font-medium">Customer</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Total</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Date</th>
                    <th className="text-left text-gray-400 pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSales.map((sale) => (
                    <tr key={sale.id} className="border-b border-surface-border hover:bg-surface transition cursor-pointer">
                      <td className="py-3 text-white font-medium">{sale.product_name}</td>
                      <td className="py-3 text-green-400 font-medium">RWF {sale.total?.toLocaleString()}</td>
                      <td className="py-3 text-gray-400">{new Date(sale.created_at).toLocaleDateString()}</td>
                      <td className="py-3">
                        <button
                          onClick={() => openSaleReceipt(sale)}
                          className="px-3 py-1 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs transition"
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

      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-sm shadow-2xl max-h-full flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Sales Receipt</h2>
              <button onClick={() => setSelectedSale(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="text-center mb-4">
                {profile?.logo_url ? (
                  <img src={profile.logo_url} alt="Logo" className="w-12 h-12 object-contain mx-auto mb-2 rounded" />
                ) : (
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center mx-auto mb-2">
                    <span className="text-white font-bold">K</span>
                  </div>
                )}
                <p className="text-white font-bold">{profile?.company_name || 'KaySales Management System'}</p>
                {profile?.company_location && <p className="text-gray-500 text-xs">{profile.company_location}</p>}
                <p className="text-gray-400 text-xs">Sales Receipt</p>
              </div>
              <div className="border-t border-surface-border pt-4 space-y-2">
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
                    {selectedSale.payment_method === 'mtn' ? 'MTN Mobile Money' :
                     selectedSale.payment_method === 'bank' ? 'Bank Transfer' :
                     selectedSale.payment_method === 'cheque' ? 'Cheque' :
                     selectedSale.payment_method === 'credit' ? 'Credit' : 'Cash'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Payment Status</span>
                  <span className={selectedSale.payment_status === 'paid' ? 'text-green-400 font-medium' : 'text-orange-400 font-medium'}>
                    {selectedSale.payment_status === 'paid' ? 'Paid' : 'Pending'}
                  </span>
                </div>
                <div className="border-t border-surface-border pt-2">
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
                <div className="border-t border-surface-border pt-2 flex justify-between">
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
              {(profile?.signature_url || profile?.stamp_url) && (
                <div className="flex justify-between items-end mt-4 pt-3 border-t border-surface-border">
                  {profile?.signature_url ? (
                    <div className="text-center">
                      <img src={profile.signature_url} alt="Signature" className="h-10 object-contain mx-auto" />
                      <p className="text-gray-500 text-[10px] mt-1">Signature</p>
                    </div>
                  ) : <div />}
                  {profile?.stamp_url ? (
                    <div className="text-center">
                      <img src={profile.stamp_url} alt="Stamp" className="h-10 object-contain mx-auto" />
                      <p className="text-gray-500 text-[10px] mt-1">Company Stamp</p>
                    </div>
                  ) : <div />}
                </div>
              )}
              <div className="text-center mt-4 text-gray-500 text-xs">
                <p>Thank you for your business!</p>
                <p>Powered by KaySales</p>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setSelectedSale(null)} className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition">
                  Close
                </button>
                <button onClick={printReceipt} className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium">
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
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
                  className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                  placeholder="e.g. Rent, Salaries, Transport"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Amount (RWF)</label>
                <input
                  type="number"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                  placeholder="0"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowExpenseModal(false)} className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition">Cancel</button>
                <button onClick={handleAddExpense} disabled={savingExpense} className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium">
                  {savingExpense ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showExpenseHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Expense Breakdown — {periodLabel}</h2>
              <button onClick={() => setShowExpenseHistory(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-5">

              <div>
                <p className="text-white font-bold text-sm mb-1">Cost of Goods Sold — RWF {cogs.toLocaleString()}</p>
                <p className="text-gray-500 text-xs mb-3">Per sale: (Revenue − Profit). Sum of the column below = the total above. Showing sales from {periodLabel} only.</p>
                {periodSales.length === 0 ? (
                  <p className="text-gray-500 text-sm">No sales in this period.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {periodSales
                      .slice()
                      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                      .map((s) => {
                        const saleCost = (s.total || 0) - (s.profit || 0)
                        return (
                          <div key={s.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
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
                  className="text-primary-light hover:text-primary text-xs underline mt-2 inline-block"
                >
                  Go to Sales page for full item-level detail →
                </button>
              </div>

              <div className="border-t border-surface-border pt-4">
                <p className="text-white font-bold text-sm mb-2">Operating Expenses — RWF {periodManualExpenses.toLocaleString()}</p>
                <p className="text-gray-500 text-xs mb-2">Showing expenses logged in {periodLabel} only.</p>
                {periodExpenseList.length === 0 ? (
                  <p className="text-gray-500 text-sm">No manual expenses logged in this period.</p>
                ) : (
                  <div className="space-y-2">
                    {periodExpenseList.map((e) => (
                      <div key={e.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
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
            <div className="px-6 py-4 border-t border-surface-border flex-shrink-0">
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

      {showRevenueBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Revenue Breakdown — {periodLabel}</h2>
              <button onClick={() => setShowRevenueBreakdown(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
              <p className="text-gray-500 text-xs mb-1">Every sale recorded in {periodLabel}, including unpaid credit sales. Sum of the column below = the total revenue figure.</p>
              {periodSales.length === 0 ? (
                <p className="text-gray-500 text-sm">No sales in this period.</p>
              ) : (
                <div className="space-y-2">
                  {periodSales
                    .slice()
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .map((s) => (
                      <div key={s.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
                        <div>
                          <p className="text-white text-sm">{s.product_name}</p>
                          <p className="text-gray-500 text-xs">
                            {new Date(s.created_at).toLocaleDateString()} · {s.payment_status === 'paid' ? 'Paid' : 'Unpaid credit'}
                          </p>
                        </div>
                        <span className="text-primary-light text-sm font-medium">RWF {(s.total || 0).toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-surface-border flex-shrink-0 flex justify-between">
              <span className="text-gray-400 text-sm">Total Revenue</span>
              <span className="text-white font-bold">RWF {periodRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {showProfitBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Profit Breakdown — {periodLabel}</h2>
              <button onClick={() => setShowProfitBreakdown(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-5">

              <div className="bg-surface rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Revenue</span>
                  <span className="text-white">RWF {periodRevenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">− Cost of Goods Sold</span>
                  <span className="text-orange-300">RWF {cogs.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">− Operating Expenses</span>
                  <span className="text-orange-300">RWF {periodManualExpenses.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-surface-border pt-2">
                  <span className="text-white font-bold">= Net Profit</span>
                  <span className="text-purple-300 font-bold">RWF {netProfit.toLocaleString()}</span>
                </div>
              </div>

              <div>
                <p className="text-white font-bold text-sm mb-1">Profit per Sale — RWF {periodProfitSum.toLocaleString()} gross</p>
                <p className="text-gray-500 text-xs mb-3">Before operating expenses are subtracted. Showing sales from {periodLabel} only.</p>
                {periodSales.length === 0 ? (
                  <p className="text-gray-500 text-sm">No sales in this period.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {periodSales
                      .slice()
                      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                      .map((s) => (
                        <div key={s.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
                          <div>
                            <p className="text-white text-sm">{s.product_name}</p>
                            <p className="text-gray-500 text-xs">{new Date(s.created_at).toLocaleDateString()}</p>
                          </div>
                          <span className="text-purple-300 text-sm font-medium">RWF {(s.profit || 0).toLocaleString()}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => { setShowProfitBreakdown(false); setShowExpenseHistory(true) }}
                className="text-primary-light hover:text-primary text-xs underline"
              >
                View full expense breakdown →
              </button>
            </div>
          </div>
        </div>
      )}

      {showStockBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Stock Value Breakdown</h2>
              <button onClick={() => setShowStockBreakdown(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
              <p className="text-gray-500 text-xs mb-1">Every product currently unsold, with its cost value (buying price × quantity) and selling value (selling price × quantity).</p>
              {allProducts.length === 0 ? (
                <p className="text-gray-500 text-sm">No products in stock.</p>
              ) : (
                <div className="space-y-2">
                  {allProducts.map((p) => (
                    <div key={p.id} className="bg-surface rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-white text-sm font-medium">{p.name}</p>
                        <span className="text-gray-500 text-xs">{p.quantity} in stock</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-cyan-400 text-xs">Cost: RWF {((p.buying_price || 0) * (p.quantity || 0)).toLocaleString()}</span>
                        <span className="text-green-400 text-xs">Selling: RWF {((p.selling_price || 0) * (p.quantity || 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-surface-border flex-shrink-0 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Total Cost Value</span>
                <span className="text-cyan-300 font-bold">RWF {stats.stockValueCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Total Selling Value</span>
                <span className="text-green-300 font-bold">RWF {stats.stockValueSelling.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}
