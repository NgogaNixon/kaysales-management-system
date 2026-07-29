import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { logActivity } from '../lib/activityLogger'
import { drawBrandedHeader, drawSignatureAndStamp } from '../lib/pdfBranding'
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
  const [quoteItems, setQuoteItems] = useState([{ product_id: '', product_name: '', quantity: '', selling_price: '', total: 0, is_consignment: false }])
  const [productSearch, setProductSearch] = useState({})
  const [showProductDropdown, setShowProductDropdown] = useState({})
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
      .order('date', { ascending: false })
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
    setQuoteItems([{ product_id: '', product_name: '', quantity: '', selling_price: '', total: 0, is_consignment: false }])
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

  const handleToggleConsignment = (index) => {
    const updated = [...quoteItems]
    const goingConsignment = !updated[index].is_consignment
    updated[index] = {
      ...updated[index],
      is_consignment: goingConsignment,
      product_id: goingConsignment ? '' : updated[index].product_id,
      product_name: goingConsignment ? '' : updated[index].product_name,
    }
    setQuoteItems(updated)
  }

  const handleConsignmentNameChange = (index, name) => {
    const updated = [...quoteItems]
    updated[index] = { ...updated[index], product_name: name }
    setQuoteItems(updated)
  }

  const addItem = () => {
    setQuoteItems([...quoteItems, { product_id: '', product_name: '', quantity: '', selling_price: '', total: 0, is_consignment: false }])
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
    if (products.length === 0) {
      setError('You have no products yet — add products first before creating a quotation')
      return
    }
    const validItems = quoteItems.filter(i =>
      (i.is_consignment ? i.product_name : i.product_id) && !isEmpty(i.quantity) && !isEmpty(i.selling_price)
    )
    if (validItems.length === 0) {
      setError('Please select a product and enter quantity + price for at least one item')
      return
    }
    if (!profile?.id) {
      alert('DIAGNOSTIC: profile is not loaded (profile.id is missing). This means the page loaded before your account data was ready. Try refreshing the page and opening Quotations again.')
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      user_id: profile.id,
      customer_name: customerName,
      date: quoteDate,
      items: validItems.map(i => ({
        product_id: i.is_consignment ? null : i.product_id,
        product_name: i.product_name,
        quantity: parseInt(i.quantity),
        selling_price: parseInt(i.selling_price),
        total: i.total,
        is_consignment: !!i.is_consignment,
      })),
      total: grandTotal,
      status: 'pending',
    }

    try {
      const { data: insertedRows, error: saveError } = await supabase
        .from('quotations')
        .insert(payload)
        .select()

      if (saveError) {
        alert('DIAGNOSTIC — Supabase rejected the save:\n\n' + JSON.stringify(saveError, null, 2))
        setError('Failed to save quotation: ' + saveError.message)
        return
      }

      if (!insertedRows || insertedRows.length === 0) {
        alert('DIAGNOSTIC: Supabase returned no error, but also returned no saved row. This usually means Row Level Security silently blocked the insert. Check that the "quotations" table has an INSERT policy allowing auth.uid() = user_id.')
        setError('Save appeared to succeed but no row was returned — likely a database permissions issue.')
        return
      }

      await logActivity(
        profile.id,
        profile.email,
        profile.full_name,
        'Add Quotation',
        `Created quotation for: ${customerName} - RWF ${grandTotal.toLocaleString()}`
      )

      setShowModal(false)
      await fetchQuotations()
    } catch (err) {
      alert('DIAGNOSTIC — Unexpected JavaScript error:\n\n' + (err?.message || String(err)))
      setError('Something went wrong while saving: ' + (err?.message || 'unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const { error: deleteError } = await supabase.from('quotations').delete().eq('id', selectedQuotation.id)
    if (deleteError) {
      alert('Could not delete this quotation:\n\n' + deleteError.message)
      return
    }
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

  const handleConvertToSale = async (quotation) => {
    if (quotation.status === 'converted') return
    setConverting(true)
    setError('')

    try {
      const itemsWithCost = []
      for (const item of quotation.items) {
        if (item.is_consignment) {
          itemsWithCost.push({ ...item, buying_price: 0 })
          continue
        }
        const { data: productData } = await supabase
          .from('products')
          .select('buying_price')
          .eq('id', item.product_id)
          .single()
        itemsWithCost.push({
          ...item,
          buying_price: productData?.buying_price || 0,
        })
      }

      const totalProfit = itemsWithCost.reduce((sum, item) => {
        return sum + ((item.selling_price - item.buying_price) * item.quantity)
      }, 0)

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
          extra_fees: 0,
          profit: totalProfit,
        })
        .select()
        .single()

      if (saleError || !saleData) {
        console.error('Convert to sale error:', saleError)
        setError('Failed to convert quotation: ' + (saleError?.message || 'unknown error'))
        return
      }

      const itemsToInsert = itemsWithCost.map(item => ({
        sale_id: saleData.id,
        user_id: profile.id,
        product_id: item.is_consignment ? null : item.product_id,
        product_name: item.product_name,
        quantity_sold: item.quantity,
        selling_price: item.selling_price,
        buying_price: item.buying_price,
        total: item.total,
        is_consignment: !!item.is_consignment,
      }))
      await supabase.from('sale_items').insert(itemsToInsert)

      for (const item of itemsWithCost) {
        if (item.is_consignment) continue
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

      fetchQuotations()
      fetchProducts()
    } catch (err) {
      console.error('Unexpected error converting quotation:', err)
      setError('Something went wrong converting to sale: ' + (err?.message || 'unknown error'))
    } finally {
      setConverting(false)
    }
  }

  const exportPDF = async (quotation) => {
    const doc = new jsPDF()

    // Branded header (logo, company name, phone/location/TIN)
    const headerEndY = await drawBrandedHeader(doc, profile)

    doc.setFontSize(12)
    doc.text(`Quotation — ${quotation.customer_name}`, 14, headerEndY)
    doc.setFontSize(10)
    doc.text(`Date: ${new Date(quotation.date).toLocaleDateString()}`, 14, headerEndY + 7)
    doc.text(`Status: ${quotation.status === 'converted' ? 'Converted to Sale' : 'Pending'}`, 14, headerEndY + 14)

    // autoTable auto-paginates on its own for long item lists — no truncation risk
    autoTable(doc, {
      startY: headerEndY + 22,
      head: [['Product', 'Qty', 'Unit Price (RWF)', 'Total (RWF)']],
      body: quotation.items.map(i => [
        i.product_name,
        i.quantity,
        i.selling_price.toLocaleString(),
        i.total.toLocaleString(),
      ]),
    })

    let finalY = doc.lastAutoTable.finalY || 60
    doc.setFontSize(11)
    doc.text(`Grand Total: RWF ${quotation.total.toLocaleString()}`, 14, finalY + 10)
    finalY += 10

    // If the table ran close to the bottom of the page, start a fresh page for
    // the signature/stamp instead of letting them get cut off.
    const pageHeight = doc.internal.pageSize.getHeight()
    if (finalY > pageHeight - 45) {
      doc.addPage()
      finalY = 20
    }

    await drawSignatureAndStamp(doc, profile, doc.internal.pageSize.getWidth(), finalY + 30)

    doc.save(`KaySales_Quotation_${quotation.customer_name.replace(/\s+/g, '_')}.pdf`)
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

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
                      <td className="px-6 py-4 text-gray-400">{new Date(q.date).toLocaleDateString()}</td>
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
                          <button onClick={() => openDelete(q)} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition">
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
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!item.is_consignment}
                        onChange={() => handleToggleConsignment(index)}
                        className="rounded"
                      />
                      <span className="text-gray-300 text-xs">🔄 Third-Party Item</span>
                    </label>
                    {item.is_consignment ? (
                      <input
                        type="text"
                        value={item.product_name}
                        onChange={(e) => handleConsignmentNameChange(index, e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Product name (not in your inventory)"
                      />
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          value={showProductDropdown[index] ? (productSearch[index] ?? '') : item.product_name}
                          onChange={(e) => {
                            setProductSearch({ ...productSearch, [index]: e.target.value })
                            setShowProductDropdown({ ...showProductDropdown, [index]: true })
                          }}
                          onFocus={() => {
                            setProductSearch({ ...productSearch, [index]: '' })
                            setShowProductDropdown({ ...showProductDropdown, [index]: true })
                          }}
                          onBlur={() => setTimeout(() => setShowProductDropdown({ ...showProductDropdown, [index]: false }), 150)}
                          className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                          placeholder="🔍 Search your stock..."
                        />
                        {showProductDropdown[index] && (
                          <div className="absolute z-20 w-full bg-gray-800 border border-gray-600 rounded-lg mt-1 max-h-48 overflow-y-auto shadow-xl">
                            {products
                              .filter(p => p.name?.toLowerCase().includes((productSearch[index] || '').toLowerCase()))
                              .map(p => (
                                <div
                                  key={p.id}
                                  onMouseDown={() => {
                                    handleProductChange(index, p.id)
                                    setProductSearch({ ...productSearch, [index]: '' })
                                    setShowProductDropdown({ ...showProductDropdown, [index]: false })
                                  }}
                                  className="px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm text-white border-b border-gray-700 last:border-0"
                                >
                                  {p.name} <span className="text-gray-400">(Stock: {p.quantity})</span>
                                </div>
                              ))}
                            {products.filter(p => p.name?.toLowerCase().includes((productSearch[index] || '').toLowerCase())).length === 0 && (
                              <div className="px-3 py-2 text-gray-500 text-sm">No products found in your stock</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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

        {showConfirm && selectedQuotation && (
          <ConfirmDialog
            message={
              selectedQuotation.status === 'converted'
                ? 'This quotation was already converted to a Sale. Deleting it only removes this quotation record — the Sale itself will NOT be affected. Continue?'
                : 'Are you sure you want to delete this quotation?'
            }
            onConfirm={handleDelete}
            onCancel={() => setShowConfirm(false)}
          />
        )}

      </div>
    </Layout>
  )
}
