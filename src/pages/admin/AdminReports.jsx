import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function AdminReports() {
  const [clients, setClients] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [creditsGiven, setCreditsGiven] = useState([])
  const [creditsTaken, setCreditsTaken] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState(null)
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'admin')
      .order('created_at', { ascending: false })

    const { data: subsData } = await supabase
      .from('subscriptions')
      .select('*')

    const { data: productsData } = await supabase
      .from('products')
      .select('*')

    const { data: salesData } = await supabase
      .from('sales')
      .select('*')

    const { data: givenData } = await supabase
      .from('credits_given')
      .select('*')

    const { data: takenData } = await supabase
      .from('credits_taken')
      .select('*')

    const { data: paymentsData } = await supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false })

    setClients(profilesData || [])
    setSubscriptions(subsData || [])
    setProducts(productsData || [])
    setSales(salesData || [])
    setCreditsGiven(givenData || [])
    setCreditsTaken(takenData || [])
    setPayments(paymentsData || [])
    setLoading(false)
  }

  const getSubscription = (userId) => subscriptions.find(s => s.user_id === userId)

  const getDaysRemaining = (expiryDate) => {
    if (!expiryDate) return null
    const today = new Date()
    const expiry = new Date(expiryDate)
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
  }

  const getSubStatus = (userId) => {
    const sub = getSubscription(userId)
    if (!sub) return 'No Subscription'
    const days = getDaysRemaining(sub.expiry_date)
    if (days === null) return 'No Expiry'
    if (days <= 0) return 'Expired'
    if (days <= 7) return `Expiring (${days}d)`
    return 'Active'
  }

  const filteredClients = clients.filter(c => {
    const matchesSearch = c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    const matchesPlan = filterPlan === 'all' || c.plan_type === filterPlan
    const sub = getSubscription(c.id)
    const days = getDaysRemaining(sub?.expiry_date)
    let matchesStatus = true
    if (filterStatus === 'active') matchesStatus = days !== null && days > 7
    if (filterStatus === 'expiring') matchesStatus = days !== null && days <= 7 && days > 0
    if (filterStatus === 'expired') matchesStatus = days !== null && days <= 0
    if (filterStatus === 'trial') matchesStatus = sub?.payment_status === 'trial'
    return matchesSearch && matchesPlan && matchesStatus
  })

  const generateClientExcel = (client) => {
    setGenerating(true)
    const wb = XLSX.utils.book_new()
    const sub = getSubscription(client.id)
    const clientPayments = payments.filter(p => p.user_id === client.id)
    const clientProducts = products.filter(p => p.user_id === client.id)
    const clientSales = sales.filter(s => s.user_id === client.id)
    const clientCreditsGiven = creditsGiven.filter(c => c.user_id === client.id)
    const clientCreditsTaken = creditsTaken.filter(c => c.user_id === client.id)

    // Sheet 1 — Client Info
    const infoData = [
      { Field: 'Full Name', Value: client.full_name },
      { Field: 'Email', Value: client.email },
      { Field: 'Plan', Value: client.plan_type },
      { Field: 'Account Status', Value: client.approved ? 'Approved' : 'Pending' },
      { Field: 'Subscription Status', Value: getSubStatus(client.id) },
      { Field: 'Subscription Start', Value: sub?.start_date ? new Date(sub.start_date).toLocaleDateString() : '—' },
      { Field: 'Subscription Expiry', Value: sub?.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : '—' },
      { Field: 'Date Joined', Value: new Date(client.created_at).toLocaleDateString() },
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoData), 'Client Info')

    // Sheet 2 — Products/Stock
    const productsData = clientProducts.map(p => ({
      'Product Name': p.name,
      'Category': p.category || '—',
      'Quantity': p.quantity,
      'Selling Price (RWF)': p.selling_price,
      'Status': p.quantity === 0 ? 'Out of Stock' : p.quantity < 3 ? 'Low Stock' : 'In Stock',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productsData.length ? productsData : [{ Info: 'No products' }]), 'Stock')

    // Sheet 3 — Sales
    const salesData = clientSales.map(s => ({
      'Customer': s.product_name,
      'Total (RWF)': s.total,
      'Date': new Date(s.created_at).toLocaleDateString(),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData.length ? salesData : [{ Info: 'No sales' }]), 'Sales')

    // Sheet 4 — Credits Given
    const givenData = clientCreditsGiven.map(c => ({
      'Customer': c.customer_name,
      'Product': c.product_name || '—',
      'Quantity': c.quantity || '—',
      'Amount (RWF)': c.amount,
      'Status': c.status || 'unpaid',
      'Date': c.date ? new Date(c.date).toLocaleDateString() : '—',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(givenData.length ? givenData : [{ Info: 'No credits given' }]), 'Credits Given')

    // Sheet 5 — Credits Taken
    const takenData = clientCreditsTaken.map(c => ({
      'Supplier': c.supplier_name,
      'Product': c.product_name || '—',
      'Quantity': c.quantity || '—',
      'Amount (RWF)': c.amount,
      'Status': c.status || 'unpaid',
      'Date': c.date ? new Date(c.date).toLocaleDateString() : '—',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(takenData.length ? takenData : [{ Info: 'No credits taken' }]), 'Credits Taken')

    // Sheet 6 — Payment History
    const paymentData = clientPayments.map(p => ({
      'Plan': p.plan_type,
      'Amount (RWF)': p.amount === 0 ? 'Free Trial' : p.amount,
      'Transaction ID': p.transaction_id,
      'Sender Name': p.sender_name,
      'Status': p.status,
      'Date': new Date(p.created_at).toLocaleDateString(),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentData.length ? paymentData : [{ Info: 'No payments' }]), 'Payment History')

    XLSX.writeFile(wb, `KaySales_${client.full_name.replace(' ', '_')}_Report.xlsx`)
    setGenerating(false)
  }

  const generateClientPDF = (client) => {
    setGenerating(true)
    const sub = getSubscription(client.id)
    const clientPayments = payments.filter(p => p.user_id === client.id)
    const clientProducts = products.filter(p => p.user_id === client.id)
    const clientSales = sales.filter(s => s.user_id === client.id)
    const clientCreditsGiven = creditsGiven.filter(c => c.user_id === client.id)
    const clientCreditsTaken = creditsTaken.filter(c => c.user_id === client.id)

    const doc = new jsPDF()

    // Header
    doc.setFontSize(16)
    doc.text('KaySales Management System', 14, 15)
    doc.setFontSize(12)
    doc.text('Client Full Report', 14, 23)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30)

    // Client Info
    doc.setFontSize(12)
    doc.text('Client Information', 14, 42)
    autoTable(doc, {
      startY: 47,
      body: [
        ['Full Name', client.full_name],
        ['Email', client.email],
        ['Plan', client.plan_type],
        ['Account Status', client.approved ? 'Approved' : 'Pending'],
        ['Subscription Status', getSubStatus(client.id)],
        ['Expiry Date', sub?.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : '—'],
        ['Date Joined', new Date(client.created_at).toLocaleDateString()],
      ],
      styles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
      theme: 'grid',
    })

    // Stock
    let y = doc.lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.text('Stock / Products', 14, y)
    autoTable(doc, {
      startY: y + 5,
      head: [['Product', 'Category', 'Qty', 'Price (RWF)', 'Status']],
      body: clientProducts.length ? clientProducts.map(p => [
        p.name, p.category || '—', p.quantity,
        p.selling_price?.toLocaleString(),
        p.quantity === 0 ? 'Out of Stock' : p.quantity < 3 ? 'Low Stock' : 'In Stock',
      ]) : [['No products', '', '', '', '']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [13, 148, 136] },
    })

    // Sales
    y = doc.lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.text('Sales History', 14, y)
    autoTable(doc, {
      startY: y + 5,
      head: [['Customer', 'Total (RWF)', 'Date']],
      body: clientSales.length ? clientSales.map(s => [
        s.product_name,
        s.total?.toLocaleString(),
        new Date(s.created_at).toLocaleDateString(),
      ]) : [['No sales', '', '']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [29, 78, 216] },
    })

    // Credits Given
    y = doc.lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.text('Credits Given', 14, y)
    autoTable(doc, {
      startY: y + 5,
      head: [['Customer', 'Product', 'Qty', 'Amount (RWF)', 'Status']],
      body: clientCreditsGiven.length ? clientCreditsGiven.map(c => [
        c.customer_name, c.product_name || '—', c.quantity || '—',
        c.amount?.toLocaleString(), c.status || 'unpaid',
      ]) : [['No credits given', '', '', '', '']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [234, 179, 8] },
    })

    // Credits Taken
    y = doc.lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.text('Credits Taken', 14, y)
    autoTable(doc, {
      startY: y + 5,
      head: [['Supplier', 'Product', 'Qty', 'Amount (RWF)', 'Status']],
      body: clientCreditsTaken.length ? clientCreditsTaken.map(c => [
        c.supplier_name, c.product_name || '—', c.quantity || '—',
        c.amount?.toLocaleString(), c.status || 'unpaid',
      ]) : [['No credits taken', '', '', '', '']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [239, 68, 68] },
    })

    // Payment History
    y = doc.lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.text('Payment History', 14, y)
    autoTable(doc, {
      startY: y + 5,
      head: [['Plan', 'Amount', 'Transaction ID', 'Status', 'Date']],
      body: clientPayments.length ? clientPayments.map(p => [
        p.plan_type,
        p.amount === 0 ? 'Free Trial' : `RWF ${p.amount?.toLocaleString()}`,
        p.transaction_id,
        p.status,
        new Date(p.created_at).toLocaleDateString(),
      ]) : [['No payments', '', '', '', '']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [10, 22, 40] },
    })

    doc.save(`KaySales_${client.full_name.replace(' ', '_')}_Report.pdf`)
    setGenerating(false)
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">📑 Admin Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Generate full client reports with all their information</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Clients', value: clients.length, icon: '👥' },
            { label: 'Total Products', value: products.length, icon: '📦' },
            { label: 'Total Sales', value: sales.length, icon: '💰' },
            { label: 'Low Stock Items', value: products.filter(p => p.quantity < 3).length, icon: '⚠️' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-2xl font-bold text-white mt-2">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search client by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm flex-1 focus:outline-none focus:border-blue-500"
          />
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Plans</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring Soon</option>
            <option value="expired">Expired</option>
            <option value="trial">Trial</option>
          </select>
        </div>

        {/* Clients List */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12"><p className="text-gray-400">Loading clients...</p></div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-12"><p className="text-gray-500">No clients found</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Client</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Plan</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Products</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Sales</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Download Report</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <tr key={client.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4">
                        <p className="text-white font-medium">{client.full_name}</p>
                        <p className="text-gray-500 text-xs">{client.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${client.plan_type === 'premium' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'}`}>
                          {client.plan_type === 'premium' ? '⭐ Premium' : '📦 Standard'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          getSubStatus(client.id) === 'Active' ? 'bg-green-900 text-green-300' :
                          getSubStatus(client.id).includes('Expiring') ? 'bg-orange-900 text-orange-300' :
                          getSubStatus(client.id) === 'Expired' ? 'bg-red-900 text-red-300' :
                          'bg-gray-800 text-gray-400'
                        }`}>
                          {getSubStatus(client.id)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-300">
                        {products.filter(p => p.user_id === client.id).length} items
                      </td>
                      <td className="px-6 py-4 text-gray-300">
                        {sales.filter(s => s.user_id === client.id).length} sales
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => generateClientExcel(client)}
                            disabled={generating}
                            className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition"
                          >
                            📊 Excel
                          </button>
                          <button
                            onClick={() => generateClientPDF(client)}
                            disabled={generating}
                            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition"
                          >
                            📄 PDF
                          </button>
                        </div>
                      </td>
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