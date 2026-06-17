import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import OTPVerify from '../components/OTPVerify'
import UndoToast from '../components/UndoToast'
import { logActivity } from '../lib/activityLogger'
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
  const [showReceipt, setShowReceipt] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showOTP, setShowOTP] = useState(false)
  const [otpAction, setOtpAction] = useState('')
  const [exportType, setExportType] = useState('')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [selectedSale, setSelectedSale] = useState(null)
  const [pendingEditSale, setPendingEditSale] = useState(null)
  const [receiptSale, setReceiptSale] = useState(null)
  const [receiptItems, setReceiptItems] = useState([])
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0])
  const [saleItems, setSaleItems] = useState([{ product_id: '', product_name: '', quantity_sold: '', selling_price: '', total: 0 }])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [showUndoToast, setShowUndoToast] = useState(false)

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
    setPendingEditSale(null)
    setCustomerName('')
    setPaymentMethod('cash')
    setSaleDate(new Date().toISOString().split('T')[0])
    setSaleItems([{ product_id: '', product_name: '', quantity_sold: '', selling_price: '', total: 0 }])
    setError('')
    setShowModal(true)
  }

  const openEdit = async (sale) => {
    setSelectedSale(sale)
    setPendingEditSale(sale)
    setCustomerName(sale.product_name)
    setPaymentMethod(sale.payment_method || 'cash')
    setSaleDate(sale.created_at ? sale.created_at.split('T')[0] : new Date().toISOString().split('T')[0])
    setError('')

    const { data: existingItems } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', sale.id)

    if (existingItems && existingItems.length > 0) {
      setSaleItems(existingItems.map(item => ({
        product_id: item.product_id || '',
        product_name: item.product_name,
        quantity_sold: item.quantity_sold,
        selling_price: item.selling_price,
        total: item.total,
      })))
    } else {
      setSaleItems([{ product_id: '', product_name: '', quantity_sold: '', selling_price: '', total: 0 }])
    }

    setShowModal(true)
  }

  const openDelete = (sale) => {
    setSelectedSale(sale)
    setShowConfirm(true)
  }

  const handleProductChange = (index, productId) => {
    const product = products.find(p => p.id === productId)
    const updated = [...saleItems]
    if (product) {
      updated[index] = {
        ...updated[index],
        product_id: productId,
        product_name: product.name,
        selling_price: product.selling_price,
        total: product.selling_price * (parseInt(updated[index].quantity_sold) || 0)
      }
    }
    setSaleItems(updated)
  }

  const handleQuantityChange = (index, qty) => {
    const updated = [...saleItems]
    const price = parseInt(updated[index].selling_price) || 0
    updated[index] = { ...updated[index], quantity_sold: qty, total: price * (parseInt(qty) || 0) }
    setSaleItems(updated)
  }

  const handlePriceChange = (index, price) => {
    const updated = [...saleItems]
    const qty = parseInt(updated[index].quantity_sold) || 0
    updated[index] = { ...updated[index], selling_price: price, total: parseInt(price) * qty }
    setSaleItems(updated)
  }

  const addItem = () => {
    setSaleItems([...saleItems, { product_id: '', product_name: '', quantity_sold: '', selling_price: '', total: 0 }])
  }

  const removeItem = (index) => {
    if (saleItems.length === 1) return
    setSaleItems(saleItems.filter((_, i) => i !== index))
  }

  const grandTotal = saleItems.reduce((sum, item) => sum + (item.total || 0), 0)

  const handleSave = async (saleToEdit = null) => {
    const editSale = saleToEdit || pendingEditSale || selectedSale

    if (!customerName) {
      setError('Customer name is required')
      return
    }
    const validItems = saleItems.filter(i => i.product_id && i.quantity_sold && i.selling_price)
    if (validItems.length === 0) {
      setError('Please add at least one product')
      return
    }

    setSaving(true)
    setError('')

    let saleData, saleError

    if (editSale) {
      // UPDATE existing sale
      const { data, error } = await supabase
        .from('sales')
        .update({
          product_name: customerName,
          quantity_sold: validItems.reduce((sum, i) => sum + parseInt(i.quantity_sold), 0),
          total: grandTotal,
          payment_method: paymentMethod,
        })
        .eq('id', editSale.id)
        .select()
        .single()
      saleData = data
      saleError = error

      if (!saleError && saleData) {
        // Update date if changed
        if (saleDate !== editSale.created_at?.split('T')[0]) {
          await supabase.from('sales').update({ created_at: saleDate }).eq('id', editSale.id)
        }
        // Delete old items and insert new ones
        await supabase.from('sale_items').delete().eq('sale_id', editSale.id)
        const itemsToInsert = validItems.map(item => ({
          sale_id: editSale.id,
          user_id: profile.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity_sold: parseInt(item.quantity_sold),
          selling_price: parseInt(item.selling_price),
          total: item.total,
        }))
        await supabase.from('sale_items').insert(itemsToInsert)
      }
    } else {
      // INSERT new sale
      const { data, error } = await supabase
        .from('sales')
        .insert({
          user_id: profile.id,
          product_name: customerName,
          quantity_sold: validItems.reduce((sum, i) => sum + parseInt(i.quantity_sold), 0),
          selling_price: 0,
          total: grandTotal,
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'credit' ? 'pending' : 'paid',
        })
        .select()
        .single()
      saleData = data
      saleError = error

      if (!saleError && saleData) {
        // Update date if not today
        if (saleDate !== new Date().toISOString().split('T')[0]) {
          await supabase.from('sales').update({ created_at: saleDate }).eq('id', saleData.id)
        }

        // Insert sale items
        const itemsToInsert = validItems.map(item => ({
          sale_id: saleData.id,
          user_id: profile.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity_sold: parseInt(item.quantity_sold),
          selling_price: parseInt(item.selling_price),
          total: item.total,
        }))
        await supabase.from('sale_items').insert(itemsToInsert)

        // Reduce product quantities
        for (const item of validItems) {
          const { data: freshProduct } = await supabase
            .from('products')
            .select('quantity')
            .eq('id', item.product_id)
            .single()
          if (freshProduct) {
            await supabase
              .from('products')
              .update({ quantity: freshProduct.quantity - parseInt(item.quantity_sold) })
              .eq('id', item.product_id)
          }
        }

        console.log('Sale data before credit insert:', saleData)
        // If credit payment, add to credits given
        if (paymentMethod === 'credit') {
          for (const item of validItems) {
            await supabase.from('credits_given').insert({
              user_id: profile.id,
              customer_name: customerName,
              product_name: item.product_name,
              quantity: parseInt(item.quantity_sold),
              amount: item.total,
              date: saleDate,
              notes: 'Auto-added from sale on credit',
              status: 'unpaid',
              sale_id: saleData.id,
            })
          }
        }
      }
    }

    if (saleError) {
      setError('Failed to save sale: ' + saleError.message)
      setSaving(false)
      return
    }

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      editSale ? 'Edit Sale' : 'Add Sale',
      `${editSale ? 'Updated' : 'Added'} sale for: ${customerName} - RWF ${grandTotal.toLocaleString()} - Payment: ${paymentMethod}`
    )

    setSaving(false)
    setShowModal(false)
    setShowOTP(false)
    setSelectedSale(null)
    setPendingEditSale(null)
    fetchSales()
    fetchProducts()
  }

  const handleDelete = async () => {
    setShowConfirm(false)
    setPendingDelete(selectedSale)
    setShowUndoToast(true)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return

    const { data: items } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', pendingDelete.id)

    // Restore product quantities
    if (items && items.length > 0) {
      for (const item of items) {
        const { data: freshProduct } = await supabase
          .from('products')
          .select('quantity')
          .eq('id', item.product_id)
          .single()
        if (freshProduct) {
          await supabase
            .from('products')
            .update({ quantity: freshProduct.quantity + item.quantity_sold })
            .eq('id', item.product_id)
        }
      }
    }

    await supabase.from('sale_items').delete().eq('sale_id', pendingDelete.id)
    await supabase.from('sales').delete().eq('id', pendingDelete.id)

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      'Delete Sale',
      `Deleted sale for: ${pendingDelete.product_name} - RWF ${pendingDelete.total?.toLocaleString()}`
    )

    setPendingDelete(null)
    setShowUndoToast(false)
    fetchSales()
    fetchProducts()
  }

  const handleUndo = () => {
    setPendingDelete(null)
    setShowUndoToast(false)
  }

  const generateReceipt = async (sale) => {
    const { data: items } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', sale.id)
    setReceiptSale(sale)
    setReceiptItems(items || [])
    setShowReceipt(true)
  }

  const printReceipt = () => {
    const doc = new jsPDF({ format: [80, 200], unit: 'mm' })
    doc.setFontSize(12)
    doc.text('KaySales Management System', 40, 10, { align: 'center' })
    doc.setFontSize(9)
    doc.text('Sales Receipt', 40, 16, { align: 'center' })
    doc.text('--------------------------------', 40, 20, { align: 'center' })
    doc.text(`Date: ${new Date(receiptSale.created_at).toLocaleDateString()}`, 5, 26)
    doc.text(`Customer: ${receiptSale.product_name}`, 5, 32)
    const paymentLabel = receiptSale.payment_method === 'mtn' ? 'MTN Mobile Money' :
      receiptSale.payment_method === 'bank' ? 'Bank Transfer' :
      receiptSale.payment_method === 'cheque' ? 'Cheque' :
      receiptSale.payment_method === 'credit' ? 'Credit' : 'Cash'
    doc.text(`Payment: ${paymentLabel}`, 5, 38)
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
    doc.text(`GRAND TOTAL: RWF ${receiptSale.total?.toLocaleString()}`, 40, y + 7, { align: 'center' })
    doc.setFontSize(8)
    doc.text('Thank you for your business!', 40, y + 14, { align: 'center' })
    doc.text('Powered by KaySales', 40, y + 19, { align: 'center' })
    doc.save(`Receipt_${receiptSale.product_name}_${new Date(receiptSale.created_at).toLocaleDateString()}.pdf`)
  }

  const handleExport = () => {
    const exportFiltered = sales.filter(s => {
      const d = new Date(s.created_at)
      const from = exportFrom ? d >= new Date(exportFrom) : true
      const to = exportTo ? d <= new Date(exportTo + 'T23:59:59') : true
      return from && to
    })
    const exportRevenue = exportFiltered.reduce((sum, s) => sum + (s.total || 0), 0)

    if (exportType === 'excel') {
      const data = exportFiltered.map(s => ({
        Customer: s.product_name,
        'Total (RWF)': s.total,
        Payment: s.payment_method || 'cash',
        Date: new Date(s.created_at).toLocaleDateString(),
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sales')
      XLSX.writeFile(wb, `KaySales_Sales_${exportFrom || 'all'}_to_${exportTo || 'all'}.xlsx`)
    } else {
      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text('KaySales Management System', 14, 15)
      doc.setFontSize(12)
      doc.text('Sales Report', 14, 25)
      doc.setFontSize(10)
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 32)
      doc.text(`Total Revenue: RWF ${exportRevenue.toLocaleString()}`, 14, 39)
      autoTable(doc, {
        startY: 48,
        head: [['Customer', 'Total (RWF)', 'Payment', 'Date']],
        body: exportFiltered.map(s => [
          s.product_name,
          s.total?.toLocaleString(),
          s.payment_method || 'cash',
          new Date(s.created_at).toLocaleDateString(),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [29, 78, 216] },
      })
      doc.save(`KaySales_Sales_${exportFrom || 'all'}_to_${exportTo || 'all'}.pdf`)
    }
    setShowExportModal(false)
    setExportFrom('')
    setExportTo('')
  }

  const filtered = sales.filter(s => {
    const matchesSearch = s.product_name?.toLowerCase().includes(search.toLowerCase())
    const d = new Date(s.created_at)
    const from = dateFrom ? d >= new Date(dateFrom) : true
    const to = dateTo ? d <= new Date(dateTo + 'T23:59:59') : true
    return matchesSearch && from && to
  })

  const totalRevenue = filtered.reduce((sum, s) => sum + (s.total || 0), 0)

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">💰 Sales</h1>
            <p className="text-gray-400 text-sm mt-1">Record and manage your sales</p>
          </div>
          <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm">
            + Record Sale
          </button>
        </div>

        {/* Filters & Export */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm flex-1 focus:outline-none focus:border-blue-500"
          />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
          <button onClick={() => { setExportType('excel'); setShowExportModal(true) }} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm transition font-medium">📊 Excel</button>
          <button onClick={() => { setExportType('pdf'); setShowExportModal(true) }} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium">📄 PDF</button>
        </div>

        {/* Revenue Summary */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Total Revenue</p>
            <p className="text-green-400 text-2xl font-bold">RWF {totalRevenue.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-sm">Total Sales</p>
            <p className="text-white text-2xl font-bold">{filtered.length}</p>
          </div>
        </div>

        {/* Sales Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12"><p className="text-gray-400">Loading sales...</p></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-3">No sales found</p>
              <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">Record First Sale</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Customer</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Total</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Payment</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Date</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sale) => (
                    <tr key={sale.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4 text-white font-medium">{sale.product_name}</td>
                      <td className="px-6 py-4 text-green-400 font-medium">RWF {sale.total?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-gray-300 text-xs">
                        {sale.payment_method === 'cash' ? '💵 Cash' :
                         sale.payment_method === 'mtn' ? '📱 MTN' :
                         sale.payment_method === 'bank' ? '🏦 Bank' :
                         sale.payment_method === 'cheque' ? '📄 Cheque' :
                         sale.payment_method === 'credit' ? '💳 Credit' : '💵 Cash'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          sale.payment_status === 'paid' ? 'bg-green-900 text-green-300' :
                          sale.payment_status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                          'bg-green-900 text-green-300'
                        }`}>
                          {sale.payment_status === 'pending' ? '⏳ Pending' : '✅ Paid'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400">{new Date(sale.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => generateReceipt(sale)} className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition">Receipt</button>
                          <button onClick={() => openEdit(sale)} className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition">Edit</button>
                          <button onClick={() => openDelete(sale)} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition">Delete</button>
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
        <Modal title={pendingEditSale ? 'Edit Sale' : 'Record Sale'} onClose={() => { setShowModal(false); setSelectedSale(null); setPendingEditSale(null) }}>
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
              <label className="text-gray-400 text-sm mb-1 block">Sale Date</label>
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="cash">💵 Cash</option>
                <option value="mtn">📱 MTN Mobile Money</option>
                <option value="bank">🏦 Bank Transfer</option>
                <option value="cheque">📄 Cheque</option>
                <option value="credit">💳 Credit (Add to Credits Given)</option>
              </select>
            </div>
            {paymentMethod === 'credit' && (
              <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-3">
                <p className="text-yellow-300 text-xs">⚠️ This sale will be automatically added to Credits Given as unpaid.</p>
              </div>
            )}
            <div className="space-y-3">
              <label className="text-gray-400 text-sm block">Products *</label>
              {saleItems.map((item, index) => (
                <div key={index} className="bg-gray-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs">Item {index + 1}</span>
                    {saleItems.length > 1 && (
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
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={item.quantity_sold}
                      onChange={(e) => handleQuantityChange(index, e.target.value)}
                      className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Quantity"
                    />
                    <input
                      type="number"
                      value={item.selling_price}
                      onChange={(e) => handlePriceChange(index, e.target.value)}
                      className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Price (RWF)"
                    />
                  </div>
                  {item.total > 0 && (
                    <p className="text-green-400 text-sm font-medium">Subtotal: RWF {item.total.toLocaleString()}</p>
                  )}
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
              <button onClick={() => { setShowModal(false); setSelectedSale(null); setPendingEditSale(null) }} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">Cancel</button>
              <button
                onClick={() => {
                  if (pendingEditSale) {
                    setOtpAction('edit')
                    setShowModal(false)
                    setShowOTP(true)
                  } else {
                    handleSave()
                  }
                }}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                {saving ? 'Saving...' : pendingEditSale ? 'Update Sale' : 'Record Sale'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Delete */}
      {showConfirm && !showOTP && (
        <ConfirmDialog
          message="Are you sure you want to delete this sale?"
          onConfirm={() => { setShowConfirm(false); setOtpAction('delete'); setShowOTP(true) }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* OTP / Password Verify */}
      {showOTP && (
        <OTPVerify
          actionLabel={otpAction === 'delete'
            ? `Delete sale for: ${selectedSale?.product_name}`
            : `Edit sale for: ${pendingEditSale?.product_name}`}
          onVerified={() => {
            setShowOTP(false)
            if (otpAction === 'delete') {
              handleDelete()
            } else {
              handleSave(pendingEditSale)
            }
          }}
          onCancel={() => setShowOTP(false)}
        />
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">{exportType === 'excel' ? '📊 Export Excel' : '📄 Export PDF'}</h2>
              <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-gray-400 text-sm">Select date range. Leave blank to export all records.</p>
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
                <button onClick={handleExport} className={`flex-1 py-2 text-white rounded-lg transition font-medium ${exportType === 'excel' ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600'}`}>Download</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receiptSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl max-h-full flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Sales Receipt</h2>
              <button onClick={() => setShowReceipt(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
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
                  <span className="text-white">{new Date(receiptSale.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Customer</span>
                  <span className="text-white">{receiptSale.product_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Payment</span>
                  <span className="text-white">
                    {receiptSale.payment_method === 'mtn' ? '📱 MTN Mobile Money' :
                     receiptSale.payment_method === 'bank' ? '🏦 Bank Transfer' :
                     receiptSale.payment_method === 'cheque' ? '📄 Cheque' :
                     receiptSale.payment_method === 'credit' ? '💳 Credit' : '💵 Cash'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Status</span>
                  <span className={receiptSale.payment_status === 'pending' ? 'text-yellow-400' : 'text-green-400'}>
                    {receiptSale.payment_status === 'pending' ? '⏳ Pending' : '✅ Paid'}
                  </span>
                </div>
                <div className="border-t border-gray-700 pt-2">
                  <p className="text-gray-400 text-xs mb-2">Items:</p>
                  {receiptItems.length > 0 ? receiptItems.map((item, i) => (
                    <div key={i} className="mb-2">
                      <p className="text-white text-sm">{item.product_name}</p>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{item.quantity_sold} x RWF {item.selling_price?.toLocaleString()}</span>
                        <span className="text-green-400">RWF {item.total?.toLocaleString()}</span>
                      </div>
                    </div>
                  )) : (
                    <p className="text-gray-500 text-sm">No items found</p>
                  )}
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between">
                  <span className="text-white font-bold">GRAND TOTAL</span>
                  <span className="text-green-400 font-bold text-lg">RWF {receiptSale.total?.toLocaleString()}</span>
                </div>
              </div>
              <div className="text-center mt-4 text-gray-500 text-xs">
                <p>Thank you for your business!</p>
                <p>Powered by KaySales</p>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowReceipt(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">Close</button>
                <button onClick={printReceipt} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">Download PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {showUndoToast && pendingDelete && (
        <UndoToast
          message="Sale deleted — stock will be restored"
          onUndo={handleUndo}
          onExpire={confirmDelete}
        />
      )}

    </Layout>
  )
}