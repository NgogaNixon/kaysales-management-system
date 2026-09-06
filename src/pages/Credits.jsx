import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import OTPVerify from '../components/OTPVerify'
import { logActivity } from '../lib/activityLogger'
import { drawBrandedHeader, drawSignatureAndStamp } from '../lib/pdfBranding'

export default function Credits() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('given')
  const [statusFilter, setStatusFilter] = useState('unpaid')
  const [creditsGiven, setCreditsGiven] = useState([])
  const [creditsTaken, setCreditsTaken] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showOTP, setShowOTP] = useState(false)
  const [exportType, setExportType] = useState('')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [selectedCredit, setSelectedCredit] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('unpaid')
  const [creditItems, setCreditItems] = useState([{ product_name: '', quantity: '', unit_price: '', amount: '' }])
  const [search, setSearch] = useState('')

  // Delete flow: 'single' deletes one credit record, 'all' deletes every
  // record for a customer at once. Both share the same OTP confirmation.
  const [deleteMode, setDeleteMode] = useState('single')
  const [deleteAllTarget, setDeleteAllTarget] = useState(null)

  // Receipt-style statement — inline "Add Payment" field with a live preview
  // of the new remaining balance before it's confirmed and saved.
  const [receiptPayAmount, setReceiptPayAmount] = useState('')
  const [receiptPayMethod, setReceiptPayMethod] = useState('cash')
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [receiptPayError, setReceiptPayError] = useState('')

  useEffect(() => {
    if (profile?.id) fetchCredits()
  }, [profile])

  const fetchCredits = async () => {
    setLoading(true)
    const { data: given } = await supabase
      .from('credits_given')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })

    const { data: taken } = await supabase
      .from('credits_taken')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })

    setCreditsGiven(given || [])
    setCreditsTaken(taken || [])
    setLoading(false)
  }

  const openAdd = () => {
    setSelectedCredit(null)
    setCustomerName('')
    setDate('')
    setNotes('')
    setStatus('unpaid')
    setCreditItems([{ product_name: '', quantity: '', unit_price: '', amount: '' }])
    setError('')
    setShowModal(true)
  }

  const openEdit = (credit) => {
    setSelectedCredit(credit)
    setCustomerName(activeTab === 'given' ? credit.customer_name : credit.supplier_name)
    setDate(credit.date ? credit.date.split('T')[0] : '')
    setNotes(credit.notes || '')
    setStatus(credit.status || 'unpaid')
    setCreditItems([{
      product_name: credit.product_name || '',
      quantity: credit.quantity || '',
      unit_price: credit.quantity && credit.amount ? Math.round(credit.amount / credit.quantity) : '',
      amount: credit.amount || '',
    }])
    setError('')
    setShowModal(true)
  }

  const openDelete = (credit) => {
    setSelectedCredit(credit)
    setDeleteMode('single')
    setShowConfirm(true)
  }

  const openDeleteAll = (group) => {
    setDeleteAllTarget(group)
    setDeleteMode('all')
    setShowConfirm(true)
  }

  const openCustomerReceipt = (group) => {
    setSelectedCustomer(group)
    setReceiptPayAmount('')
    setReceiptPayMethod('cash')
    setReceiptPayError('')
  }

  const closeCustomerReceipt = () => {
    setSelectedCustomer(null)
    setReceiptPayAmount('')
    setReceiptPayError('')
  }

  const addItem = () => {
    setCreditItems([...creditItems, { product_name: '', quantity: '', unit_price: '', amount: '' }])
  }

  const removeItem = (index) => {
    if (creditItems.length === 1) return
    setCreditItems(creditItems.filter((_, i) => i !== index))
  }

  const updateItem = (index, fields) => {
    const updated = [...creditItems]
    updated[index] = { ...updated[index], ...fields }
    setCreditItems(updated)
  }

  const grandTotal = creditItems.reduce((sum, item) => sum + (parseInt(item.amount) || 0), 0)

  const handleSave = async () => {
    if (!customerName) {
      setError('Name is required')
      return
    }
    const validItems = creditItems.filter(i => i.amount)
    if (validItems.length === 0) {
      setError('Please add at least one item with an amount')
      return
    }
    setSaving(true)
    setError('')

    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    const nameField = activeTab === 'given' ? 'customer_name' : 'supplier_name'

    if (selectedCredit) {
      const newAmount = parseInt(validItems[0].amount)
      const newQuantity = parseInt(validItems[0].quantity) || 0
      const newProductName = validItems[0].product_name
      const now = new Date().toISOString()

      // Manually changing the status here should keep paid_amount honest —
      // otherwise a credit marked "paid" with paid_amount still 0 would look
      // unpaid everywhere that reads paid_amount (like the linked Sale).
      let paidAmount = selectedCredit.paid_amount || 0
      let paidAt = selectedCredit.paid_at || null
      let paidMethod = selectedCredit.paid_method || null
      if (status === 'paid') {
        paidAmount = newAmount
        paidAt = paidAt || now
        paidMethod = paidMethod || 'cash'
      } else if (status === 'unpaid') {
        paidAmount = 0
        paidAt = null
        paidMethod = null
      } else if (paidAmount > newAmount) {
        // amount was reduced below what's already been paid — clamp it
        paidAmount = newAmount
      }

      await supabase.from(table).update({
        [nameField]: customerName,
        product_name: newProductName,
        quantity: newQuantity,
        amount: newAmount,
        date: date || new Date().toISOString(),
        notes,
        status,
        paid_amount: paidAmount,
        paid_at: paidAt,
        paid_method: paidMethod,
      }).eq('id', selectedCredit.id)

      // Keep the originating Sale (and its receipt) in sync with this edit —
      // updates the matching sale_item, restores/deducts stock for the
      // quantity difference, recomputes the sale's total, and re-syncs its
      // payment status from all credits linked to it.
      if (activeTab === 'given' && selectedCredit.sale_id) {
        const { data: matchingItems } = await supabase
          .from('sale_items')
          .select('*')
          .eq('sale_id', selectedCredit.sale_id)
          .eq('product_name', selectedCredit.product_name)

        const saleItem = matchingItems?.[0]

        if (saleItem) {
          const newSellingPrice = newQuantity > 0 ? Math.round(newAmount / newQuantity) : saleItem.selling_price

          await supabase.from('sale_items').update({
            product_name: newProductName,
            quantity_sold: newQuantity,
            selling_price: newSellingPrice,
            total: newAmount,
          }).eq('id', saleItem.id)

          if (!saleItem.is_consignment && saleItem.product_id) {
            const quantityDelta = newQuantity - (selectedCredit.quantity || 0)
            if (quantityDelta !== 0) {
              const { data: freshProduct } = await supabase
                .from('products')
                .select('quantity')
                .eq('id', saleItem.product_id)
                .single()
              if (freshProduct) {
                await supabase
                  .from('products')
                  .update({ quantity: freshProduct.quantity - quantityDelta })
                  .eq('id', saleItem.product_id)
              }
            }
          }
        }

        const { data: allSaleItems } = await supabase
          .from('sale_items')
          .select('total, quantity_sold')
          .eq('sale_id', selectedCredit.sale_id)

        const newSaleTotal = (allSaleItems || []).reduce((sum, i) => sum + (i.total || 0), 0)
        const newSaleQuantity = (allSaleItems || []).reduce((sum, i) => sum + (i.quantity_sold || 0), 0)

        await supabase.from('sales').update({
          product_name: customerName,
          total: newSaleTotal,
          quantity_sold: newSaleQuantity,
        }).eq('id', selectedCredit.sale_id)

        await syncSalePaymentStatus(selectedCredit.sale_id)
      }
    } else {
      for (const item of validItems) {
        await supabase.from(table).insert({
          [nameField]: customerName,
          product_name: item.product_name,
          quantity: parseInt(item.quantity) || 0,
          amount: parseInt(item.amount),
          date: date || new Date().toISOString(),
          notes,
          status,
          user_id: profile.id,
        })
      }
    }

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      selectedCredit ? 'Edit Credit' : 'Add Credit',
      `${selectedCredit ? 'Updated' : 'Added'} credit for: ${customerName}`
    )

    setSaving(false)
    setShowModal(false)
    fetchCredits()

    if (selectedCustomer) {
      const updatedData = activeTab === 'given' ? creditsGiven : creditsTaken
      const nameF = activeTab === 'given' ? 'customer_name' : 'supplier_name'
      const updatedItems = updatedData.filter(c => c[nameF] === selectedCustomer.name)
      if (updatedItems.length > 0) {
        const totalAmount = updatedItems.reduce((sum, c) => sum + (c.amount || 0), 0)
        const unpaidAmount = updatedItems.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.amount || 0), 0)
        setSelectedCustomer({ ...selectedCustomer, items: updatedItems, totalAmount, unpaidAmount })
      }
    }
  }

  const handleDelete = async () => {
    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'

    if (activeTab === 'given' && selectedCredit.sale_id) {
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', selectedCredit.sale_id)

      if (saleItems && saleItems.length > 0) {
        for (const item of saleItems) {
          if (item.is_consignment) continue
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

      await supabase.from('sale_items').delete().eq('sale_id', selectedCredit.sale_id)
      await supabase.from('sales').delete().eq('id', selectedCredit.sale_id)
    }

    await supabase.from(table).delete().eq('id', selectedCredit.id)

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      'Delete Credit',
      `Deleted credit for: ${activeTab === 'given' ? selectedCredit.customer_name : selectedCredit.supplier_name} - RWF ${selectedCredit.amount?.toLocaleString()}`
    )

    setShowConfirm(false)
    setShowOTP(false)
    setSelectedCustomer(null)
    fetchCredits()
  }

  // Deletes every credit record for one customer/supplier in the current tab
  // in one go. For "Credits Given" entries that came from a sale, the linked
  // sale + sale_items are removed too and stock is restored, same as a single delete.
  const handleDeleteAll = async () => {
    if (!deleteAllTarget) return
    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    const items = deleteAllTarget.items

    for (const credit of items) {
      if (activeTab === 'given' && credit.sale_id) {
        const { data: saleItems } = await supabase
          .from('sale_items')
          .select('*')
          .eq('sale_id', credit.sale_id)

        if (saleItems && saleItems.length > 0) {
          for (const item of saleItems) {
            if (item.is_consignment) continue
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

        await supabase.from('sale_items').delete().eq('sale_id', credit.sale_id)
        await supabase.from('sales').delete().eq('id', credit.sale_id)
      }
    }

    const ids = items.map(c => c.id)
    await supabase.from(table).delete().in('id', ids)

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      'Delete All Credits',
      `Deleted all ${items.length} credit record(s) for: ${deleteAllTarget.name} (${activeTab === 'given' ? 'Credits Given' : 'Credits Taken'})`
    )

    setShowConfirm(false)
    setShowOTP(false)
    setDeleteAllTarget(null)
    setSelectedCustomer(null)
    fetchCredits()
  }

  const syncSalePaymentStatus = async (saleId) => {
    const { data: items } = await supabase
      .from('credits_given')
      .select('amount, paid_amount')
      .eq('sale_id', saleId)

    if (!items || items.length === 0) return

    const totalAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0)
    const totalPaid = items.reduce((sum, i) => sum + (i.paid_amount || 0), 0)
    const status = totalPaid >= totalAmount ? 'paid' : totalPaid > 0 ? 'partial' : 'pending'

    await supabase.from('sales').update({
      payment_status: status,
      amount_paid: totalPaid,
    }).eq('id', saleId)
  }

  const handleResetToUnpaid = async (credit) => {
    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    await supabase.from(table).update({
      status: 'unpaid',
      paid_amount: 0,
      paid_at: null,
      paid_method: null,
    }).eq('id', credit.id)
    if (activeTab === 'given' && credit.sale_id) {
      await syncSalePaymentStatus(credit.sale_id)
    }
    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      'Reset Credit to Unpaid',
      `Reset credit to unpaid for: ${activeTab === 'given' ? credit.customer_name : credit.supplier_name} - RWF ${credit.amount?.toLocaleString()}`
    )
    await fetchCredits()
    closeCustomerReceipt()
  }

  // Applies a payment against a customer's outstanding balance, oldest debt
  // first, across as many credit records as the amount covers. Anything left
  // over on an item becomes a "partial" status; fully covered items become "paid".
  const handleConfirmReceiptPayment = async () => {
    if (!selectedCustomer) return
    const amountEntered = parseInt(receiptPayAmount) || 0
    if (amountEntered <= 0) {
      setReceiptPayError('Enter an amount greater than 0')
      return
    }

    setReceiptPayError('')
    setConfirmingPayment(true)

    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    const now = new Date().toISOString()
    let remainingToApply = Math.min(amountEntered, selectedCustomer.unpaidAmount)
    const amountApplied = remainingToApply

    const unpaidItemsSorted = selectedCustomer.items
      .filter(c => c.status !== 'paid')
      .slice()
      .sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at))

    const updatedById = {}

    for (const item of unpaidItemsSorted) {
      if (remainingToApply <= 0) break
      const itemBalance = (item.amount || 0) - (item.paid_amount || 0)
      if (itemBalance <= 0) continue
      const applyAmount = Math.min(itemBalance, remainingToApply)
      const newPaidAmount = (item.paid_amount || 0) + applyAmount
      const newStatus = newPaidAmount >= (item.amount || 0) ? 'paid' : newPaidAmount > 0 ? 'partial' : 'unpaid'

      await supabase.from(table).update({
        status: newStatus,
        paid_amount: newPaidAmount,
        paid_at: now,
        paid_method: receiptPayMethod,
      }).eq('id', item.id)

      if (activeTab === 'given' && item.sale_id) {
        await syncSalePaymentStatus(item.sale_id)
        await supabase.from('sales').update({ payment_method: receiptPayMethod }).eq('id', item.sale_id)
      }

      updatedById[item.id] = { ...item, status: newStatus, paid_amount: newPaidAmount, paid_at: now, paid_method: receiptPayMethod }
      remainingToApply -= applyAmount
    }

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      'Record Payment',
      `Recorded payment of RWF ${amountApplied.toLocaleString()} for: ${selectedCustomer.name} - Method: ${receiptPayMethod}`
    )

    const mergedItems = selectedCustomer.items.map(c => updatedById[c.id] || c)
    const newUnpaidAmount = mergedItems
      .filter(c => c.status !== 'paid')
      .reduce((sum, c) => sum + (c.amount || 0) - (c.paid_amount || 0), 0)

    setConfirmingPayment(false)
    setReceiptPayAmount('')

    if (newUnpaidAmount === 0 && statusFilter === 'unpaid') {
      setSelectedCustomer(null)
    } else {
      setSelectedCustomer({ ...selectedCustomer, items: mergedItems, unpaidAmount: newUnpaidAmount })
    }

    fetchCredits()
  }

  const getPaymentLabel = (method) => {
    if (method === 'mtn') return '📱 MTN Mobile Money'
    if (method === 'bank') return '🏦 Bank Transfer'
    if (method === 'cheque') return '📄 Cheque'
    return '💵 Cash'
  }

  const handleExportClientPDF = async () => {
    const label = activeTab === 'given' ? 'Customer' : 'Supplier'
    const items = selectedCustomer.items

    const doc = new jsPDF()

    // Branded header (logo, company name, phone/location/TIN)
    const headerEndY = await drawBrandedHeader(doc, profile)

    doc.setFontSize(12)
    doc.text(`Credit Statement — ${selectedCustomer.name}`, 14, headerEndY)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, headerEndY + 7)
    doc.text(`Total Amount: RWF ${selectedCustomer.totalAmount.toLocaleString()}`, 14, headerEndY + 14)
    doc.text(`Unpaid Amount: RWF ${selectedCustomer.unpaidAmount.toLocaleString()}`, 14, headerEndY + 21)

    // autoTable auto-paginates on its own for long credit lists — no truncation risk
    autoTable(doc, {
      startY: headerEndY + 29,
      head: [['Product', 'Qty', 'Unit Price', 'Amount (RWF)', 'Date', 'Status', 'Paid At', 'Payment Method']],
      body: items.map(c => [
        c.product_name || '—',
        c.quantity || '—',
        c.quantity && c.amount ? Math.round(c.amount / c.quantity).toLocaleString() : '—',
        c.amount?.toLocaleString() || '0',
        c.date ? new Date(c.date).toLocaleDateString() : '—',
        c.status === 'paid' ? 'Paid' : c.status === 'partial' ? 'Partial' : 'Unpaid',
        c.paid_at ? new Date(c.paid_at).toLocaleString() : '—',
        c.paid_method ? (getPaymentLabel(c.paid_method) || '—') : '—',
      ]),
    })

    let finalY = doc.lastAutoTable.finalY || 60

    // If the table ran close to the bottom of the page, start a fresh page for
    // the signature/stamp instead of letting them get cut off.
    const pageHeight = doc.internal.pageSize.getHeight()
    if (finalY > pageHeight - 45) {
      doc.addPage()
      finalY = 20
    }

    await drawSignatureAndStamp(doc, profile, doc.internal.pageSize.getWidth(), finalY + 30)

    doc.save(`KaySales_${label}_${selectedCustomer.name.replace(/\s+/g, '_')}_Credits.pdf`)
  }

  const handleExport = () => {
    const currentData = activeTab === 'given' ? creditsGiven : creditsTaken
    const nameField = activeTab === 'given' ? 'customer_name' : 'supplier_name'
    const exportFiltered = currentData.filter(c => {
      const creditDate = new Date(c.date || c.created_at)
      const matchesFrom = exportFrom ? creditDate >= new Date(exportFrom) : true
      const matchesTo = exportTo ? creditDate <= new Date(exportTo + 'T23:59:59') : true
      return matchesFrom && matchesTo
    })
    const totalAmount = exportFiltered.reduce((sum, c) => sum + (c.amount || 0), 0)
    const label = activeTab === 'given' ? 'Credits Given' : 'Credits Taken'

    if (exportType === 'excel') {
      const data = exportFiltered.map(c => ({
        [activeTab === 'given' ? 'Customer' : 'Supplier']: c[nameField],
        Product: c.product_name || '—',
        Quantity: c.quantity || '—',
        'Amount (RWF)': c.amount,
        Date: c.date ? new Date(c.date).toLocaleDateString() : '—',
        Status: c.status || 'unpaid',
        'Paid At': c.paid_at ? new Date(c.paid_at).toLocaleString() : '—',
        'Payment Method': c.paid_method || '—',
        Notes: c.notes || '—',
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, label)
      XLSX.writeFile(wb, `KaySales_${label}_${exportFrom || 'all'}_to_${exportTo || 'all'}.xlsx`)
    } else {
      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text(profile?.company_name || 'KaySales Management System', 14, 15)
      doc.setFontSize(12)
      doc.text(`${label} Report`, 14, 25)
      doc.setFontSize(10)
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 32)
      doc.text(`Total Amount: RWF ${totalAmount.toLocaleString()}`, 14, 39)
      autoTable(doc, {
        startY: 48,
        head: [[activeTab === 'given' ? 'Customer' : 'Supplier', 'Product', 'Qty', 'Amount (RWF)', 'Date', 'Status', 'Paid At']],
        body: exportFiltered.map(c => [
          c[nameField],
          c.product_name || '—',
          c.quantity || '—',
          c.amount?.toLocaleString(),
          c.date ? new Date(c.date).toLocaleDateString() : '—',
          c.status || 'unpaid',
          c.paid_at ? new Date(c.paid_at).toLocaleString() : '—',
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [29, 78, 216] },
      })
      doc.save(`KaySales_${label}_${exportFrom || 'all'}_to_${exportTo || 'all'}.pdf`)
    }
    setShowExportModal(false)
    setExportFrom('')
    setExportTo('')
  }

  const currentCredits = activeTab === 'given' ? creditsGiven : creditsTaken
  const nameField = activeTab === 'given' ? 'customer_name' : 'supplier_name'

  const allGrouped = currentCredits.reduce((acc, credit) => {
    const name = credit[nameField] || 'Unknown'
    if (!acc[name]) acc[name] = { name, items: [], totalAmount: 0, unpaidAmount: 0 }
    acc[name].items.push(credit)
    acc[name].totalAmount += credit.amount || 0
    if (credit.status !== 'paid') acc[name].unpaidAmount += (credit.amount || 0) - (credit.paid_amount || 0)
    return acc
  }, {})

  const groupedList = Object.values(allGrouped)
    .filter(group => {
      if (statusFilter === 'unpaid') return group.unpaidAmount > 0
      if (statusFilter === 'paid') return group.unpaidAmount === 0
      return true
    })
    .filter(group => group.name.toLowerCase().includes(search.toLowerCase()))

  const unpaidGiven = creditsGiven.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.amount || 0) - (c.paid_amount || 0), 0)
  const unpaidTaken = creditsTaken.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.amount || 0) - (c.paid_amount || 0), 0)

  // Live preview: what the balance will look like if the current input is confirmed
  const previewApplied = selectedCustomer ? Math.min(parseInt(receiptPayAmount) || 0, selectedCustomer.unpaidAmount) : 0
  const previewRemaining = selectedCustomer ? Math.max(selectedCustomer.unpaidAmount - previewApplied, 0) : 0

  return (
    <Layout>
      <div className="p-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">💳 Credits</h1>
            <p className="text-gray-400 text-sm mt-1">Track credits given and taken</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setExportType('excel'); setShowExportModal(true) }} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm transition font-medium">📊 Excel</button>
            <button onClick={() => { setExportType('pdf'); setShowExportModal(true) }} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium">📄 PDF</button>
            <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm">+ Add Credit</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-2xl">⏳</span>
            <p className="text-2xl font-bold mt-2 text-orange-400">RWF {unpaidGiven.toLocaleString()}</p>
            <p className="text-gray-400 text-sm mt-1">Credits Given — Pending</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-2xl">💸</span>
            <p className="text-2xl font-bold mt-2 text-red-400">RWF {unpaidTaken.toLocaleString()}</p>
            <p className="text-gray-400 text-sm mt-1">Credits Taken — Not Yet Paid</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('given')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'given' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              📤 Credits Given ({creditsGiven.length})
            </button>
            <button onClick={() => setActiveTab('taken')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'taken' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              📥 Credits Taken ({creditsTaken.length})
            </button>
          </div>
          <div className="flex gap-2">
            {['all', 'unpaid', 'paid'].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium transition ${statusFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <input
          type="text"
          placeholder={`Search by ${activeTab === 'given' ? 'customer' : 'supplier'} name...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
        />

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12"><p className="text-gray-400">Loading credits...</p></div>
          ) : groupedList.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-3">No credits found</p>
              <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">Add First Credit</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">{activeTab === 'given' ? 'Customer' : 'Supplier'}</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Items</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Total</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Unpaid</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedList.map((group) => (
                    <tr key={group.name} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4 text-white font-medium cursor-pointer" onClick={() => openCustomerReceipt(group)}>{group.name}</td>
                      <td className="px-6 py-4 text-gray-300 cursor-pointer" onClick={() => openCustomerReceipt(group)}>{group.items.length} item{group.items.length > 1 ? 's' : ''}</td>
                      <td className={`px-6 py-4 font-medium cursor-pointer ${activeTab === 'given' ? 'text-yellow-400' : 'text-red-400'}`} onClick={() => openCustomerReceipt(group)}>
                        RWF {group.totalAmount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => openCustomerReceipt(group)}>
                        {group.unpaidAmount > 0
                          ? <span className="text-red-400 font-medium text-xs">RWF {group.unpaidAmount.toLocaleString()}</span>
                          : <span className="text-green-400 text-xs">All paid</span>
                        }
                      </td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => openCustomerReceipt(group)}>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${group.unpaidAmount > 0 ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>
                          {group.unpaidAmount > 0 ? '❌ Has Unpaid' : '✅ All Paid'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-blue-400 text-xs cursor-pointer" onClick={() => openCustomerReceipt(group)}>View →</span>
                          <button
                            onClick={() => openDeleteAll(group)}
                            className="px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded-lg text-xs transition"
                            title={`Delete all records for ${group.name}`}
                          >
                            🗑️ Delete All
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

      {/* Customer Credit Statement — branded like every other receipt in the system */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl max-h-full flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Credit Statement</h2>
              <button onClick={closeCustomerReceipt} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">

              <div className="text-center mb-4">
                {profile?.logo_url ? (
                  <img src={profile.logo_url} alt="Logo" className="w-12 h-12 object-contain mx-auto mb-2 rounded" />
                ) : (
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <span className="text-white font-bold">K</span>
                  </div>
                )}
                <p className="text-white font-bold">{profile?.company_name || 'KaySales Management System'}</p>
                {profile?.company_location && <p className="text-gray-500 text-xs">{profile.company_location}</p>}
                <p className="text-gray-400 text-xs">{activeTab === 'given' ? 'Customer' : 'Supplier'} Credit Statement</p>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{activeTab === 'given' ? 'Customer' : 'Supplier'}</span>
                  <span className="text-white font-medium">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Statement Date</span>
                  <span className="text-white">{new Date().toLocaleDateString()}</span>
                </div>

                <div className="border-t border-gray-700 pt-2">
                  <p className="text-gray-400 text-xs mb-2">Items:</p>
                  {selectedCustomer.items.map((credit) => (
                    <div key={credit.id} className="mb-2">
                      <div className="flex justify-between text-sm">
                        <p className="text-white text-sm">{credit.product_name || '—'}</p>
                        <span className={`text-xs font-medium ${
                          credit.status === 'paid' ? 'text-green-400' : credit.status === 'partial' ? 'text-orange-400' : 'text-red-400'
                        }`}>
                          {credit.status === 'paid' ? 'Paid' : credit.status === 'partial' ? 'Partial' : 'Unpaid'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>
                          {credit.quantity || '—'} x RWF {credit.quantity && credit.amount ? Math.round(credit.amount / credit.quantity).toLocaleString() : '—'}
                        </span>
                        <span className="text-green-400">RWF {credit.amount?.toLocaleString()}</span>
                      </div>
                      {credit.paid_amount > 0 && (
                        <p className="text-gray-500 text-xs">Paid so far: RWF {credit.paid_amount.toLocaleString()}{credit.paid_method ? ` (${getPaymentLabel(credit.paid_method)})` : ''}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-700 pt-2 flex justify-between">
                  <span className="text-white font-bold">TOTAL</span>
                  <span className="text-white font-bold text-lg">RWF {selectedCustomer.totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Already Paid</span>
                  <span className="text-green-400">RWF {(selectedCustomer.totalAmount - selectedCustomer.unpaidAmount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white font-bold">BALANCE DUE</span>
                  <span className={`font-bold text-lg ${selectedCustomer.unpaidAmount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    RWF {selectedCustomer.unpaidAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Add Payment — live preview, confirm to save */}
              {selectedCustomer.unpaidAmount > 0 ? (
                <div className="mt-4 bg-gray-800 rounded-lg p-4 space-y-3">
                  <p className="text-white text-sm font-medium">➕ Add Payment</p>
                  {receiptPayError && <p className="text-red-400 text-xs">{receiptPayError}</p>}
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Amount Received Now</label>
                    <input
                      type="number"
                      value={receiptPayAmount}
                      onChange={(e) => setReceiptPayAmount(e.target.value)}
                      max={selectedCustomer.unpaidAmount}
                      className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="0"
                    />
                    <p className="text-gray-500 text-xs mt-1">
                      If this covers more than one unpaid item, the oldest debts are paid off first.
                    </p>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Payment Method</label>
                    <select
                      value={receiptPayMethod}
                      onChange={(e) => setReceiptPayMethod(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="cash">💵 Cash</option>
                      <option value="mtn">📱 MTN Mobile Money</option>
                      <option value="bank">🏦 Bank Transfer</option>
                      <option value="cheque">📄 Cheque</option>
                    </select>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3 flex justify-between items-center">
                    <span className="text-gray-400 text-xs">New Remaining Balance</span>
                    <span className={`font-bold ${previewRemaining > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                      RWF {previewRemaining.toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={handleConfirmReceiptPayment}
                    disabled={!receiptPayAmount || parseInt(receiptPayAmount) <= 0 || confirmingPayment}
                    className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                  >
                    {confirmingPayment ? 'Saving...' : 'Confirm Payment'}
                  </button>
                </div>
              ) : (
                <div className="mt-4 bg-green-900 border border-green-700 rounded-lg p-3 text-center">
                  <p className="text-green-300 text-sm font-medium">✅ Fully paid — no balance due</p>
                </div>
              )}

              {/* Per-item management */}
              <div className="mt-5 space-y-2">
                <p className="text-gray-500 text-xs uppercase tracking-wide">Manage Items</p>
                {selectedCustomer.items.map((credit) => (
                  <div key={credit.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-white text-sm">{credit.product_name || '—'}</p>
                      <p className="text-gray-500 text-xs">RWF {credit.amount?.toLocaleString()} · {credit.status === 'paid' ? 'Paid' : credit.status === 'partial' ? 'Partial' : 'Unpaid'}</p>
                    </div>
                    <div className="flex gap-2">
                      {credit.status !== 'unpaid' && (
                        <button onClick={() => handleResetToUnpaid(credit)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition">Reset</button>
                      )}
                      <button onClick={() => { closeCustomerReceipt(); openEdit(credit) }} className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs transition">Edit</button>
                      <button onClick={() => openDelete(credit)} className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-xs transition">Delete</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-center mt-4 text-gray-500 text-xs">
                <p>Thank you for your business!</p>
                <p>Powered by KaySales</p>
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={closeCustomerReceipt} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">Close</button>
                <button onClick={handleExportClientPDF} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">Download PDF</button>
                <button
                  onClick={() => openDeleteAll(selectedCustomer)}
                  className="px-3 py-2 bg-red-900 hover:bg-red-800 text-red-300 rounded-lg text-xs transition"
                  title="Delete all records for this customer"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <Modal
          title={selectedCredit ? `Edit Credit ${activeTab === 'given' ? 'Given' : 'Taken'}` : `Add Credit ${activeTab === 'given' ? 'Given' : 'Taken'}`}
          onClose={() => setShowModal(false)}
        >
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">{activeTab === 'given' ? 'Customer Name *' : 'Supplier Name *'}</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder={activeTab === 'given' ? 'Customer name' : 'Supplier name'}
              />
            </div>

            <div className="space-y-3">
              <label className="text-gray-400 text-sm block">Products</label>
              {creditItems.map((item, index) => (
                <div key={index} className="bg-gray-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs">Item {index + 1}</span>
                    {creditItems.length > 1 && (
                      <button onClick={() => removeItem(index)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={item.product_name}
                    onChange={(e) => updateItem(index, { product_name: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Product name"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => {
                        const qty = e.target.value
                        const price = parseInt(item.unit_price) || 0
                        updateItem(index, { quantity: qty, amount: (parseInt(qty) || 0) * price })
                      }}
                      className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Qty"
                    />
                    <input
                      type="number"
                      value={item.unit_price || ''}
                      onChange={(e) => {
                        const price = e.target.value
                        const qty = parseInt(item.quantity) || 0
                        updateItem(index, { unit_price: price, amount: qty * (parseInt(price) || 0) })
                      }}
                      className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Unit Price"
                    />
                    <input
                      type="number"
                      value={item.amount}
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
                <p className="text-gray-400 text-sm">Total Amount</p>
                <p className={`text-xl font-bold ${activeTab === 'given' ? 'text-yellow-400' : 'text-red-400'}`}>
                  RWF {grandTotal.toLocaleString()}
                </p>
              </div>
            )}

            <div>
              <label className="text-gray-400 text-sm mb-1 block">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-1 block">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500">
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-1 block">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500" placeholder="Any additional notes..." rows={2} />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
                {saving ? 'Saving...' : selectedCredit ? 'Update' : 'Add Credit'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showConfirm && !showOTP && (
        <ConfirmDialog
          message={
            deleteMode === 'all'
              ? `Are you sure you want to delete ALL ${deleteAllTarget?.items.length} credit record(s) for "${deleteAllTarget?.name}"? ${activeTab === 'given' ? 'Any linked sales will also be deleted and stock restored. ' : ''}This cannot be undone.`
              : `Are you sure you want to delete this credit?${selectedCredit?.sale_id ? ' The linked sale will also be deleted and stock restored.' : ''}`
          }
          onConfirm={() => { setShowConfirm(false); setShowOTP(true) }}
          onCancel={() => { setShowConfirm(false); setDeleteAllTarget(null) }}
        />
      )}

      {showOTP && (
        <OTPVerify
          actionLabel={
            deleteMode === 'all'
              ? `Delete ALL credit records for: ${deleteAllTarget?.name}`
              : `Delete credit for: ${selectedCredit?.customer_name || selectedCredit?.supplier_name}`
          }
          onVerified={() => (deleteMode === 'all' ? handleDeleteAll() : handleDelete())}
          onCancel={() => { setShowOTP(false); setDeleteAllTarget(null) }}
        />
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl">
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

    </Layout>
  )
}
