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
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterClient, setFilterClient] = useState('all')
  const [filterPlan, setFilterPlan] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [activeTab, setActiveTab] = useState('clients')

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

    const { data: paymentsData } = await supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false })

    setClients(profilesData || [])
    setSubscriptions(subsData || [])
    setProducts(productsData || [])
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

  const getClientPayments = (userId) => payments.filter(p => p.user_id === userId)

  // Filter clients
  const filteredClients = clients.filter(c => {
    const matchesClient = filterClient === 'all' || c.id === filterClient
    const matchesPlan = filterPlan === 'all' || c.plan_type === filterPlan
    const sub = getSubscription(c.id)
    const days = getDaysRemaining(sub?.expiry_date)
    let matchesStatus = true
    if (filterStatus === 'active') matchesStatus = days !== null && days > 7
    if (filterStatus === 'expiring') matchesStatus = days !== null && days <= 7 && days > 0
    if (filterStatus === 'expired') matchesStatus = days !== null && days <= 0
    if (filterStatus === 'trial') matchesStatus = sub?.payment_status === 'trial'
    return matchesClient && matchesPlan && matchesStatus
  })

  // Filter products
  const filteredProducts = products.filter(p => {
    if (filterClient === 'all') return true
    return p.user_id === filterClient
  })

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()

    // Sheet 1 — Clients
    const clientData = filteredClients.map(c => {
      const sub = getSubscription(c.id)
      const days = getDaysRemaining(sub?.expiry_date)
      const clientPayments = getClientPayments(c.id)
      return {
        'Full Name': c.full_name,
        'Email': c.email,
        'Plan': c.plan_type,
        'Status': c.approved ? 'Approved' : 'Pending',
        'Subscription Status': getSubStatus(c.id),
        'Expiry Date': sub?.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : '—',
        'Days Remaining': days !== null ? days : '—',
        'Total Payments': clientPayments.filter(p => p.status === 'approved').length,
        'Joined': new Date(c.created_at).toLocaleDateString(),
      }
    })
    const ws1 = XLSX.utils.json_to_sheet(clientData)
    XLSX.utils.book_append_sheet(wb, ws1, 'Clients')

    // Sheet 2 — Stock
    const stockData = filteredProducts.map(p => {
      const client = clients.find(c => c.id === p.user_id)
      return {
        'Client Name': client?.full_name || '—',
        'Client Email': client?.email || '—',
        'Product Name': p.name,
        'Category': p.category || '—',
        'Quantity': p.quantity,
        'Selling Price (RWF)': p.selling_price,
        'Status': p.quantity === 0 ? 'Out of Stock' : p.quantity < 3 ? 'Low Stock' : 'In Stock',
      }
    })
    const ws2 = XLSX.utils.json_to_sheet(stockData)
    XLSX.utils.book_append_sheet(wb, ws2, 'Stock')

    XLSX.writeFile(wb, `KaySales_Admin_Report_${new Date().toLocaleDateString()}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('KaySales Management System', 14, 15)
    doc.setFontSize(12)
    doc.text('Admin Full Report', 14, 25)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32)
    doc.text(`Total Clients: ${filteredClients.length}`, 14, 39)

    // Clients Table
    doc.setFontSize(12)
    doc.text('Client Information', 14, 50)
    autoTable(doc, {
      startY: 55,
      head: [['Name', 'Email', 'Plan', 'Status', 'Sub Status', 'Expiry']],
      body: filteredClients.map(c => {
        const sub = getSubscription(c.id)
        return [
          c.full_name,
          c.email,
          c.plan_type,
          c.approved ? 'Approved' : 'Pending',
          getSubStatus(c.id),
          sub?.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : '—',
        ]
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [10, 22, 40] },
    })

    // Stock Table
    const finalY = doc.lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.text('Stock Information', 14, finalY)
    autoTable(doc, {
      startY: finalY + 5,
      head: [['Client', 'Product', 'Category', 'Qty', 'Price (RWF)', 'Status']],
      body: filteredProducts.map(p => {
        const client = clients.find(c => c.id === p.user_id)
        return [
          client?.full_name || '—',
          p.name,
          p.category || '—',
          p.quantity,
          p.selling_price?.toLocaleString(),
          p.quantity === 0 ? 'Out of Stock' : p.quantity < 3 ? 'Low Stock' : 'In Stock',
        ]
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [13, 148, 136] },
    })

    doc.save(`KaySales_Admin_Report_${new Date().toLocaleDateString()}.pdf`)
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📊 Admin Reports</h1>
            <p className="text-gray-400 text-sm mt-1">Full system report with client and stock information</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm transition font-medium">📊 Excel</button>
            <button onClick={exportPDF} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium">📄 PDF</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Clients', value: clients.length, icon: '👥' },
            { label: 'Active Subscriptions', value: clients.filter(c => { const d = getDaysRemaining(getSubscription(c.id)?.expiry_date); return d !== null && d > 0 }).length, icon: '✅' },
            { label: 'Total Products', value: products.length, icon: '📦' },
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
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500 flex-1"
          >
            <option value="all">All Clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
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

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'clients' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            👥 Clients ({filteredClients.length})
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'stock' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            📦 Stock ({filteredProducts.length})
          </button>
        </div>

        {/* Clients Tab */}
        {activeTab === 'clients' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="text-center py-12"><p className="text-gray-400">Loading...</p></div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-12"><p className="text-gray-500">No clients found</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Name</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Email</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Plan</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Account Status</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Subscription</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Expiry</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => {
                      const sub = getSubscription(client.id)
                      const days = getDaysRemaining(sub?.expiry_date)
                      return (
                        <tr key={client.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                          <td className="px-6 py-4 text-white font-medium">{client.full_name}</td>
                          <td className="px-6 py-4 text-gray-300">{client.email}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${client.plan_type === 'premium' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'}`}>
                              {client.plan_type === 'premium' ? '⭐ Premium' : '📦 Standard'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${client.approved ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                              {client.approved ? '✅ Approved' : '⏳ Pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              days === null ? 'bg-gray-800 text-gray-400' :
                              days <= 0 ? 'bg-red-900 text-red-300' :
                              days <= 7 ? 'bg-orange-900 text-orange-300' :
                              'bg-green-900 text-green-300'
                            }`}>
                              {getSubStatus(client.id)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-400">
                            {sub?.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-6 py-4 text-gray-400">
                            {new Date(client.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Stock Tab */}
        {activeTab === 'stock' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="text-center py-12"><p className="text-gray-400">Loading...</p></div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12"><p className="text-gray-500">No products found</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Client</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Product</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Category</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Qty</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Price (RWF)</th>
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => {
                      const client = clients.find(c => c.id === product.user_id)
                      return (
                        <tr key={product.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                          <td className="px-6 py-4">
                            <p className="text-white font-medium">{client?.full_name || '—'}</p>
                            <p className="text-gray-500 text-xs">{client?.email || '—'}</p>
                          </td>
                          <td className="px-6 py-4 text-white">{product.name}</td>
                          <td className="px-6 py-4 text-gray-300">{product.category || '—'}</td>
                          <td className="px-6 py-4">
                            <span className={`font-bold ${product.quantity < 3 ? 'text-orange-400' : 'text-white'}`}>
                              {product.quantity}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-300">{product.selling_price?.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              product.quantity === 0 ? 'bg-red-900 text-red-300' :
                              product.quantity < 3 ? 'bg-orange-900 text-orange-300' :
                              'bg-green-900 text-green-300'
                            }`}>
                              {product.quantity === 0 ? '❌ Out of Stock' : product.quantity < 3 ? '⚠️ Low Stock' : '✅ In Stock'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </Layout>
  )
}