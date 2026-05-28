import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Sales() {
  const { profile } = useAuth()
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [selectedSale, setSelectedSale] = useState(null)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [form, setForm] = useState({
    product_id: '',
    product_name: '',
    quantity_sold: '',
    selling_price: '',
    total: 0,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile?.id) {
      fetchSales()
      fetchProducts()
    }
  }, [profile])

  const fetchSales = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    setSales(data || [])
    setLoading(false)
  }

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', profile.id)
    setProducts(data || [])
  }

  const openAdd = () => {
    setSelectedSale(null)
    setForm({ product_id: '', product_name: '', quantity_sold: '', selling_price: '', total: 0 })
    setError('')
    setShowModal(true)
  }

  const openEdit = (sale) => {
    setSelectedSale(sale)
    setForm({
      product_id: sale.product_id || '',
      product_name: sale.product_name,
      quantity_sold: sale.quantity_sold,
      selling_price: sale.selling_price,
      total: sale.total,
    })
    setError('')
    setShowModal(true)
  }

  const openDelete = (sale) => {
    setSelectedSale(sale)
    setShowConfirm(true)
  }

  const handleProductChange = (productId) => {
    const product = products.find(p => p.id === productId)
    if (product) {
      setForm({
        ...form,
        product_id: productId,
        product_name: product.name,
        selling_price: product.selling_price,
        total: product.selling_price * (parseInt(form.quantity_sold) || 0),
      })
    }
  }

  const handleQuantityChange = (qty) => {
    const price = parseInt(form.selling_price) || 0
    setForm({ ...form, quantity_sold: qty, total: price * (parseInt(qty) || 0) })
  }

  const handleSave = async () => {
    if (!form.product_name || !form.quantity_sold || !form.selling_price) {
      setError('Product, quantity and selling price are required')
      return
    }
    setSaving(true)
    setError('')

    const data = {
      product_id: form.product_id || null,
      product_name: form.product_name,
      quantity_sold: parseInt(form.quantity_sold),
      selling_price: parseInt(form.selling_price),
      total: parseInt(form.selling_price) * parseInt(form.quantity_sold),
      user_id: profile.id,
    }

    if (selectedSale) {
      await supabase.from('sales').update(data).eq('id', selectedSale.id)
    } else {
      await supabase.from('sales').insert(data)
      // Reduce product quantity
      if (form.product_id) {
        const product = products.find(p => p.id === form.product_id)
        if (product) {
          await supabase
            .from('products')
            .update({ quantity: product.quantity - parseInt(form.quantity_sold) })
            .eq('id', form.product_id)
        }
      }
    }

    setSaving(false)
    setShowModal(false)
    fetchSales()
    fetchProducts()
  }

  const handleDelete = async () => {
    await supabase.from('sales').delete().eq('id', selectedSale.id)
    setShowConfirm(false)
    fetchSales()
  }

  const filtered = sales.filter(s => {
    const matchesSearch = s.product_name?.toLowerCase().includes(search.toLowerCase())
    const saleDate = new Date(s.created_at)
    const matchesFrom = dateFrom ? saleDate >= new Date(dateFrom) : true
    const matchesTo = dateTo ? saleDate <= new Date(dateTo + 'T23:59:59') : true
    return matchesSearch && matchesFrom && matchesTo
  })

  const totalRevenue = filtered.reduce((sum, s) => sum + (s.total || 0), 0)

  const exportExcel = () => {
    const data = filtered.map(s => ({
      Product: s.product_name,
      Quantity: s.quantity_sold,
      'Selling Price (RWF)': s.selling_price,
      'Total (RWF)': s.total,
      Date: new Date(s.created_at).toLocaleDateString(),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales')
    XLSX.writeFile(wb, 'KaySales_Sales_Report.xlsx')
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('KaySales Management System', 14, 15)
    doc.setFontSize(12)
    doc.text('Sales Report', 14, 25)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 32)
    doc.text(`Total Revenue: RWF ${totalRevenue.toLocaleString()}`, 14, 39)

    autoTable(doc, {
      startY: 45,
      head: [['Product', 'Qty', 'Price (RWF)', 'Total (RWF)', 'Date']],
      body: filtered.map(s => [
        s.product_name,
        s.quantity_sold,
        s.selling_price?.toLocaleString(),
        s.total?.toLocaleString(),
        new Date(s.created_at).toLocaleDateString(),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [29, 78, 216] },
    })

    doc.save('KaySales_Sales_Report.pdf')
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">💰 Sales</h1>
            <p className="text-gray-400 text-sm mt-1">Record and manage your sales</p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
          >
            + Record Sale
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Total Sales', value: filtered.length, icon: '🧾' },
            { label: 'Total Revenue', value: `RWF ${totalRevenue.toLocaleString()}`, icon: '💵' },
            { label: 'Avg per Sale', value: `RWF ${filtered.length > 0 ? Math.round(totalRevenue / filtered.length).toLocaleString() : 0}`, icon: '📊' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-xl font-bold text-white mt-2">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filters & Export */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm flex-1 focus:outline-none focus:border-blue-500"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={exportExcel}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm transition font-medium"
          >
            📊 Excel
          </button>
          <button
            onClick={exportPDF}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium"
          >
            📄 PDF
          </button>
        </div>

        {/* Sales Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading sales...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-3">No sales found</p>
              <button
                onClick={openAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
              >
                Record First Sale
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Product</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Qty</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Price</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Total</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Date</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sale) => (
                    <tr key={sale.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4 text-white font-medium">{sale.product_name}</td>
                      <td className="px-6 py-4 text-gray-300">{sale.quantity_sold}</td>
                      <td className="px-6 py-4 text-gray-300">RWF {sale.selling_price?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-green-400 font-medium">RWF {sale.total?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-gray-400">{new Date(sale.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(sale)}
                            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openDelete(sale)}
                            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition"
                          >
                            Delete
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

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={selectedSale ? 'Edit Sale' : 'Record Sale'}
          onClose={() => setShowModal(false)}
        >
          <div className="space-y-4">
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Product *</label>
              <select
                value={form.product_id}
                onChange={(e) => handleProductChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a product</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Stock: {p.quantity})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Quantity Sold *</label>
              <input
                type="number"
                value={form.quantity_sold}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Selling Price (RWF) *</label>
              <input
                type="number"
                value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value, total: e.target.value * form.quantity_sold })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="0"
              />
            </div>
            <div className="bg-gray-800 rounded-lg px-4 py-3">
              <p className="text-gray-400 text-sm">Total</p>
              <p className="text-green-400 text-xl font-bold">RWF {(parseInt(form.selling_price) * parseInt(form.quantity_sold) || 0).toLocaleString()}</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                {saving ? 'Saving...' : selectedSale ? 'Update' : 'Record Sale'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Delete */}
      {showConfirm && (
        <ConfirmDialog
          message={`Are you sure you want to delete this sale of "${selectedSale?.product_name}"?`}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}

    </Layout>
  )
}