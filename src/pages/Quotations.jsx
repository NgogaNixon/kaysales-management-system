import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { logActivity } from '../lib/activityLogger'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const isEmpty = (v) => v === '' || v === null || v === undefined

export default function Quotations() {
  const { profile } = useAuth()
  const [quotations, setQuotations] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0])
  const [quoteItems, setQuoteItems] = useState([{ product_id: '', product_name: '', quantity: '', selling_price: '', total: 0 }])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    if (profile?.id) {
      fetchQuotations()
      fetchProducts()
    }
  }, [profile])

  const fetchQuotations = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('quotations')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    setQuotations(data || [])
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
    setSelectedQuotation(null)
    setCustomerName('')
    setQuoteDate(new Date().toISOString().split('T')[0])
    setQuoteItems([{ product_id: '', product_name: '', quantity: '', selling_price: '', total: 0 }])
    setError('')
    setShowModal(true)
  }

  const openDelete = (quotation) => {
    setSelectedQuotation(quotation)
    setShowConfirm(true)
  }

  const handleProductChange = (index, productId) => {
    const product = products.find(p => p.id === productId)
    const updated = [...quoteItems]
    if (product) {
      updated[index] = {
        ...updated[index],
        product_id: productId,
        product_name: product.name,
        selling_price: product.selling_price,
        total: product.selling_price * (parseInt(updated[index].quantity) || 0),
      }
    }
    setQuoteItems(updated)
  }

  const handleQuantityChange = (index, qty) => {
    const updated = [...quoteItems]
    const price = parseInt(updated[index].selling_price) || 0
    updated[index] = { ...updated[index], quantity: qty, total: price * (parseInt(qty) || 0) }
    setQuoteItems(updated)
  }

  const handlePriceChange = (index, price) => {
    const updated = [...quoteItems]
    const qty = parseInt(updated[index].quantity) || 0
    updated[index] = { ...updated[index], selling_price: price, total: (parseInt(price) || 0) * qty }
    setQuoteItems(updated)
  }

  const addItem = () => {
    setQuoteItems([...quoteItems, { product_id: '', product_name: '', quantity: '', selling_price: '', total: 0 }])
  }

  const removeItem = (index) => {
    if (quoteItems.length === 1) return
    setQuoteItems(quoteItems.filter((_, i) => i !== index))
  }

  const grandTotal = quoteItems.reduce((sum, item) => sum + (item.total || 0), 0)

  const handleSave = async () => {
    if (isEmpty(customerName)) {
      setError('Customer name is required')
      return
    }
    const validItems = quoteItems.filter(i => i.product_id && !isEmpty(i.quantity) && !isEmpty(i.selling_price))
    if (validItems.length === 0) {
      setError('Please add at least one product')
      return
    }

    setSaving(true)
    setError('')

    const { error: saveError } = await supabase.from('quotations').insert({
      user_id: profile.id,
      customer_name: customerName,
      items: validItems.map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: parseInt(i.quantity),
        selling_price: parseInt(i.selling_price),
        total: i.total,
      })),
      total: grandTotal,
      status: 'pending',
      created_at: quoteDate,
    })

    if (saveError) {
      setError('Failed to save quotation: ' + saveError.message)
      setSaving(false)
      return
    }

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      'Add Quotation',
      `Created quotation for: ${customerName} - RWF ${grandTotal.toLocaleString()}`
    )

    setSaving(false)
    setShowModal(false)
    fetchQuotations()
  }

  const handleDelete = async () => {
    await supabase.from('quotations').delete().eq('id', selectedQuotation.id)
    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      'Delete Quotation',
      `Deleted quotation for: ${selectedQuotation.customer_name}`
    )
    setShowConfirm(false)
    setSelectedQuotation(null)
    fetchQuotations()
  }

  // Quotation does not touch stock. Converting to a Sale is the only place stock is reduced.
  const handleConvertToSale = async (quotation) => {
    if (quotation.status === 'converted') return
    setConverting(true)

    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert({
        user_id: profile.id,
        product_name: quotation.customer_name,
        quantity_sold: quotation.items.reduce((sum, i) => sum + i.quantity, 0),
        selling_price: 0,
        total: quotation.total,
        payment_method: 'cash',
        payment_status: 'paid',
      })
      .select()
      .single()

    if (saleError || !saleData) {
      setError('Failed to convert quotation: ' + (saleError?.message || 'unknown error'))
      setConverting(false)
      return
    }

    const itemsToInsert = quotation.items.map(item => ({
      sale_id: saleData.id,
      user_id: profile.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity_sold: item.quantity,
      selling_price: item.selling_price,
      total: item.total,
    }))
    await supabase.from('sale_items').insert(itemsToInsert)

    // Reduce stock now that this is a real sale
    for (const item of quotation.items) {
      const { data: freshProduct } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', item.product_id)
        .single()
      if (freshProduct) {
        await supabase
          .from('products')
          .update({ quantity: freshProduct.quantity - item.quantity })
          .eq('id', item.product_id)
      }
    }

    await supabase
      .from('quotations')
      .update({ status: 'converted', sale_id: saleData.id })
      .eq('id', quotation.id)

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      'Convert Quotation to Sale',
      `Converted quotation for: ${quotation.customer_name} - RWF ${quotation.total.toLocaleString()}`
    )

    setConverting(false)
    fetchQuotations()
    fetchProducts()
  }

  const exportPDF = (quotation) => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('KaySales Management System', 14, 15)
    doc.setFontSize(12)
    doc.text(`Quotation — ${quotation.customer_name}`, 14, 25)
    doc.setFontSize(10)
    doc.text(`Date: ${new Date(quotation.created_at).toLocaleDateString()}`, 14, 32)
    doc.text(`Status: ${quotation.status === 'converted' ? 'Converted to Sale' : 'Pending'}`, 14, 39)
    autoTable(doc, {
      startY: 47,
      head: [['Product', 'Qty', 'Unit Price (RWF)', 'Total (RWF)']],
      body: quotation.items.map(i => [
        i.product_name,
        i.quantity,
        i.selling_price.toLocaleString(),
        i.total.toLocaleString(),
      ]),
    })
    const finalY = doc.lastAutoTable.finalY || 60
    doc.setFontSize(11)
    doc.text(`Grand Total: RWF ${quotation.total.toLocaleString()}`, 14, finalY + 10)
    doc.save(`KaySales_Quotation_${quotation.customer_name.replace(/\s+/g, '_')}.pdf`)
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">📝 Quotations</h1>
            <p className="text-gray-400 text-sm mt-1">Create price quotes for customers — stock is untouched until converted to a sale</p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + New Quotation
          </button>
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12"><p className="text-gray-400">Loading...</p></div>
          ) : quotations.length === 0 ? (
            <div className="text-center py-12"><p className="text-gray-500">No quotations yet</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Customer</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Items</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Total</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Date</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((q) => (
                    <tr key={q.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4 text-white font-medium">{q.customer_name}</td>
                      <td className="px-6 py-4 text-gray-300">{q.items.length} item{q.items.length > 1 ? 's' : ''}</td>
                      <td className="px-6 py-4 text-green-400 font-medium">RWF {q.total.toLocaleString()}</td>
                      <td className="px-6 py-4 text-gray-400">{new Date(q.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          q.status === 'converted' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
                        }`}>
                          {q.status === 'converted' ? '✅ Converted' : '⏳ Pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => exportPDF(q)} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition">
                            📄 PDF
                          </button>
                          {q.status !== 'converted' && (
                            <button
                              onClick={() => handleConvertToSale(q)}
                              disabled={converting}
                              className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition"
                            >
                              🔁 Convert to Sale
                            </button>
                          )}
                          {q.status !== 'converted' && (
                            <button onClick={() => openDelete(q)} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition">
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Modal */}
        {showModal && (
          <Modal title="New Quotation" onClose={() => setShowModal(false)}>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Customer Name *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Customer name"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Date</label>
                <input
                  type="date"
                  value={quoteDate}
                  onChange={(e) => setQuoteDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-3">
                <label className="text-gray-400 text-sm block">Products</label>
                {quoteItems.map((item, index) => (
                  <div key={index} className="bg-gray-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Item {index + 1}</span>
                      {quoteItems.length > 1 && (
                        <button onClick={() => removeItem(index)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                      )}
                    </div>
                    <select
                      value={item.product_id}
                      onChange={(e) => handleProductChange(index, e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select product</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Stock: {p.quantity})</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(index, e.target.value)}
                        className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Qty"
                      />
                      <input
                        type="number"
                        value={item.selling_price}
                        onChange={(e) => handlePriceChange(index, e.target.value)}
                        className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Price"
                      />
                      <input
                        type="number"
                        value={item.total}
                        readOnly
                        className="bg-gray-600 border border-gray-600 text-green-400 px-3 py-2 rounded-lg text-sm font-medium"
                        placeholder="Total"
                      />
                    </div>
                  </div>
                ))}
                <button onClick={addItem} className="w-full py-2 border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 rounded-lg text-sm transition">
                  + Add Another Product
                </button>
              </div>

              {grandTotal > 0 && (
                <div className="bg-gray-800 rounded-lg px-4 py-3">
                  <p className="text-gray-400 text-sm">Grand Total</p>
                  <p className="text-green-400 text-xl font-bold">RWF {grandTotal.toLocaleString()}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
                  {saving ? 'Saving...' : 'Save Quotation'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Confirm Delete */}
        {showConfirm && (
          <ConfirmDialog
            message="Are you sure you want to delete this quotation?"
            onConfirm={handleDelete}
            onCancel={() => setShowConfirm(false)}
          />
        )}

      </div>
    </Layout>
  )
}
