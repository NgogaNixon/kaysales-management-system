import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useError } from '../context/ErrorContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import OTPVerify from '../components/OTPVerify'
import { logActivity } from '../lib/activityLogger'

export default function Credits() {
  const { profile } = useAuth()
  const { showError } = useError()
  const [activeTab, setActiveTab] = useState('given')
  const [statusFilter, setStatusFilter] = useState('unpaid')
  const [creditsGiven, setCreditsGiven] = useState([])
  const [creditsTaken, setCreditsTaken] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [showOTP, setShowOTP] = useState(false)
  const [exportType, setExportType] = useState('')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [selectedCredit, setSelectedCredit] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [payMethod, setPayMethod] = useState('cash')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('unpaid')
  const [creditItems, setCreditItems] = useState([{ product_name: '', quantity: '', unit_price: '', amount: '' }])

  useEffect(() => {
    if (profile?.id) fetchCredits()
  }, [profile])

  useEffect(() => {
    const handleFocus = () => {
      if (profile?.id) fetchCredits()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [profile])

  const fetchCredits = async () => {
    setLoading(true)
    const [
      { data: given, error: givenError },
      { data: taken, error: takenError }
    ] = await Promise.all([
      supabase.from('credits_given').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('credits_taken').select('*').eq('user_id', profile.id).order('created_at', { ascending: false })
    ])
    if (givenError || takenError) showError('Failed to load credits. Please refresh.')
    setCreditsGiven(given || [])
    setCreditsTaken(taken || [])
    setLoading(false)
  }

  // Only used for Credits Taken manual entry
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
    setShowConfirm(true)
  }

  const openPayModal = (credit) => {
    setSelectedCredit(credit)
    setPayMethod('cash')
    setShowPayModal(true)
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
      showError('Name is required')
      return
    }
    const validItems = creditItems.filter(i => i.amount)
    if (validItems.length === 0) {
      setError('Please add at least one item with an amount')
      showError('Please add at least one item with an amount')
      return
    }
    setSaving(true)
    setError('')

    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    const nameField = activeTab === 'given' ? 'customer_name' : 'supplier_name'

    if (selectedCredit) {
      const { error } = await supabase.from(table).update({
        [nameField]: customerName,
        product_name: validItems[0].product_name,
        quantity: parseInt(validItems[0].quantity) || 0,
        amount: parseInt(validItems[0].amount),
        date: date || new Date().toISOString(),
        notes,
        status,
      }).eq('id', selectedCredit.id)

      if (error) {
        showError('Failed to update credit. Please try again.')
        setSaving(false)
        return
      }

      if (activeTab === 'given' && selectedCredit.sale_id) {
        await supabase
          .from('sales')
          .update({ product_name: customerName })
          .eq('id', selectedCredit.sale_id)
      }
    } else {
      for (const item of validItems) {
        const { error } = await supabase.from(table).insert({
          [nameField]: customerName,
          product_name: item.product_name,
          quantity: parseInt(item.quantity) || 0,
          amount: parseInt(item.amount),
          date: date || new Date().toISOString(),
          notes,
          status,
          user_id: profile.id,
        })
        if (error) {
          showError('Failed to add credit. Please try again.')
          setSaving(false)
          return
        }
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

    const { error } = await supabase.from(table).delete().eq('id', selectedCredit.id)
    if (error) {
      showError('Failed to delete credit. Please try again.')
      setShowOTP(false)
      return
    }

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

  const handleMarkPaid = async () => {
    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    const now = new Date().toISOString()
    const newStatus = selectedCredit.status === 'paid' ? 'unpaid' : 'paid'

    const { error } = await supabase.from(table).update({
      status: newStatus,
      paid_at: newStatus === 'paid' ? now : null,
      paid_method: newStatus === 'paid' ? payMethod : null,
    }).eq('id', selectedCredit.id)

    if (error) {
      showError('Failed to update payment status. Please try again.')
      return
    }

    if (activeTab === 'given' && selectedCredit.sale_id && newStatus === 'paid') {
      await supabase
        .from('sales')
        .update({
          payment_status: 'paid',
          payment_method: payMethod,
          paid_at: now,
        })
        .eq('id', selectedCredit.sale_id)
    } else if (activeTab === 'given' && selectedCredit.sale_id && newStatus === 'unpaid') {
      await supabase
        .from('sales')
        .update({
          payment_status: 'pending',
          paid_at: null,
        })
        .eq('id', selectedCredit.sale_id)
    }

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      newStatus === 'paid' ? 'Mark Credit Paid' : 'Mark Credit Unpaid',
      `Marked credit as ${newStatus} for: ${activeTab === 'given' ? selectedCredit.customer_name : selectedCredit.supplier_name} - RWF ${selectedCredit.amount?.toLocaleString()} - Method: ${payMethod}`
    )

    setShowPayModal(false)
    await fetchCredits()

    if (selectedCustomer) {
      const nameF = activeTab === 'given' ? 'customer_name' : 'supplier_name'
      const { data: freshCredits } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })

      const updatedItems = (freshCredits || []).filter(c => c[nameF] === selectedCustomer.name)

      if (updatedItems.every(c => c.status === 'paid') && statusFilter === 'unpaid') {
        setSelectedCustomer(null)
      } else {
        const totalAmount = updatedItems.reduce((sum, c) => sum + (c.amount || 0), 0)
        const unpaidAmount = updatedItems.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.amount || 0), 0)
        setSelectedCustomer({ ...selectedCustomer, items: updatedItems, totalAmount, unpaidAmount })
      }
    }
  }

  const handleExport = () => {
    try {
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
          'Credit Taken On': c.date ? new Date(c.date).toLocaleString() : '—',
          Status: c.status || 'unpaid',
          'Credit Paid On': c.paid_at ? new Date(c.paid_at).toLocaleString() : '—',
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
        doc.text('KaySales Management System', 14, 15)
        doc.setFontSize(12)
        doc.text(`${label} Report`, 14, 25)
        doc.setFontSize(10)
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 32)
        doc.text(`Total Amount: RWF ${totalAmount.toLocaleString()}`, 14, 39)
        autoTable(doc, {
          startY: 48,
          head: [[activeTab === 'given' ? 'Customer' : 'Supplier', 'Product', 'Qty', 'Amount (RWF)', 'Credit Taken On', 'Status', 'Credit Paid On']],
          body: exportFiltered.map(c => [
            c[nameField],
            c.product_name || '—',
            c.quantity || '—',
            c.amount?.toLocaleString(),
            c.date ? new Date(c.date).toLocaleString() : '—',
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
    } catch (e) {
      showError('Failed to export. Please try again.')
    }
  }

  const currentCredits = activeTab === 'given' ? creditsGiven : creditsTaken
  const nameField = activeTab === 'given' ? 'customer_name' : 'supplier_name'

  const allGrouped = currentCredits.reduce((acc, credit) => {
    const name = credit[nameField] || 'Unknown'
    if (!acc[name]) acc[name] = { name, items: [], totalAmount: 0, unpaidAmount: 0 }
    acc[name].items.push(credit)
    acc[name].totalAmount += credit.amount || 0
    if (credit.status !== 'paid') acc[name].unpaidAmount += credit.amount || 0
    return acc
  }, {})

  const groupedList = Object.values(allGrouped).filter(group => {
    if (statusFilter === 'unpaid') return group.unpaidAmount > 0
    if (statusFilter === 'paid') return group.unpaidAmount === 0
    return true
  })

  const totalGiven = creditsGiven.reduce((sum, c) => sum + (c.amount || 0), 0)
  const totalTaken = creditsTaken.reduce((sum, c) => sum + (c.amount || 0), 0)
  const unpaidGiven = creditsGiven.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.amount || 0), 0)
  const unpaidTaken = creditsTaken.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.amount || 0), 0)

  const getPaymentLabel = (method) => {
    if (method === 'mtn') return '📱 MTN Mobile Money'
    if (method === 'bank') return '🏦 Bank Transfer'
    if (method === 'cheque') return '📄 Cheque'
    return '💵 Cash'
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">💳 Credits</h1>
            <p className="text-gray-400 text-sm mt-1">Track credits given and taken</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setExportType('excel'); setShowExportModal(true) }} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm transition font-medium">📊 Excel</button>
            <button onClick={() => { setExportType('pdf'); setShowExportModal(true) }} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium">📄 PDF</button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Given', value: `RWF ${totalGiven.toLocaleString()}`, icon: '📤', color: 'text-yellow-400' },
            { label: 'Unpaid Given', value: `RWF ${unpaidGiven.toLocaleString()}`, icon: '⏳', color: 'text-orange-400' },
            { label: 'Total Taken', value: `RWF ${totalTaken.toLocaleString()}`, icon: '📥', color: 'text-red-400' },
            { label: 'Unpaid Taken', value: `RWF ${unpaidTaken.toLocaleString()}`, icon: '💸', color: 'text-red-300' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className={`text-2xl font-bold mt-2 ${stat.color}`}>{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setActiveTab('given')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'given' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              📤 Credits Given ({creditsGiven.length})
            </button>
            <button onClick={() => setActiveTab('taken')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'taken' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              📥 Credits Taken ({creditsTaken.length})
            </button>
            {activeTab === 'taken' && (
              <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm">+ Add Credit</button>
            )}
          </div>
          <div className="flex gap-2">
            {['all', 'unpaid', 'paid'].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium transition ${statusFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Credits Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12"><p className="text-gray-400">Loading credits...</p></div>
          ) : groupedList.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-3">No credits found</p>
              {activeTab === 'taken' && (
                <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">Add First Credit</button>
              )}
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
                    <tr key={group.name} className="border-t border-gray-800 hover:bg-gray-800 transition cursor-pointer" onClick={() => setSelectedCustomer(group)}>
                      <td className="px-6 py-4 text-white font-medium">{group.name}</td>
                      <td className="px-6 py-4 text-gray-300">{group.items.length} item{group.items.length > 1 ? 's' : ''}</td>
                      <td className={`px-6 py-4 font-medium ${activeTab === 'given' ? 'text-yellow-400' : 'text-red-400'}`}>
                        RWF {group.totalAmount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        {group.unpaidAmount > 0
                          ? <span className="text-red-400 font-medium text-xs">RWF {group.unpaidAmount.toLocaleString()}</span>
                          : <span className="text-green-400 text-xs">All paid</span>
                        }
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${group.unpaidAmount > 0 ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>
                          {group.unpaidAmount > 0 ? '❌ Has Unpaid' : '✅ All Paid'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-blue-400 text-xs">View →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Customer Details Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-full flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedCustomer.name}</h2>
                <p className="text-gray-400 text-xs">{selectedCustomer.items.length} item{selectedCustomer.items.length > 1 ? 's' : ''} · RWF {selectedCustomer.totalAmount.toLocaleString()} total</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs">Total Amount</p>
                  <p className={`text-xl font-bold ${activeTab === 'given' ? 'text-yellow-400' : 'text-red-400'}`}>
                    RWF {selectedCustomer.totalAmount.toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs">Unpaid Amount</p>
                  <p className="text-red-400 text-xl font-bold">RWF {selectedCustomer.unpaidAmount.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-2">
                {selectedCustomer.items.map((credit) => (
                  <div key={credit.id} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white font-medium">{credit.product_name || '—'}</p>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${credit.status === 'paid' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {credit.status === 'paid' ? '✅ Paid' : '❌ Unpaid'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                      <div>
                        <p className="text-gray-400 text-xs">Quantity</p>
                        <p className="text-white">{credit.quantity || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Unit Price</p>
                        <p className="text-white">
                          {credit.quantity && credit.amount
                            ? `RWF ${Math.round(credit.amount / credit.quantity).toLocaleString()}`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Total Amount</p>
                        <p className={`font-medium ${activeTab === 'given' ? 'text-yellow-400' : 'text-red-400'}`}>
                          RWF {credit.amount?.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">🕐 Credit Taken On</p>
                        <p className="text-yellow-400 text-xs">{credit.date ? new Date(credit.date).toLocaleString() : '—'}</p>
                      </div>
                    </div>
                    {credit.status === 'paid' && credit.paid_at && (
                      <div className="bg-green-900 rounded-lg p-2 mb-2">
                        <p className="text-green-300 text-xs">✅ Credit Paid On: {new Date(credit.paid_at).toLocaleString()}</p>
                        <p className="text-green-300 text-xs">Payment: {getPaymentLabel(credit.paid_method)}</p>
                      </div>
                    )}
                    {credit.status !== 'paid' && (
                      <div className="bg-gray-700 rounded-lg p-2 mb-2">
                        <p className="text-gray-400 text-xs">✅ Credit Paid On: Not yet paid</p>
                      </div>
                    )}
                    {credit.notes && <p className="text-gray-400 text-xs mb-2">📝 {credit.notes}</p>}
                    <div className="flex gap-2 flex-wrap">
                      {credit.status !== 'paid' ? (
                        <button
                          onClick={() => openPayModal(credit)}
                          className="px-3 py-1 bg-green-700 text-white rounded-lg text-xs transition hover:bg-green-600"
                        >
                          ✅ Mark Paid
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
                            const { error } = await supabase.from(table).update({
                              status: 'unpaid',
                              paid_at: null,
                              paid_method: null,
                            }).eq('id', credit.id)
                            if (error) {
                              showError('Failed to mark as unpaid. Please try again.')
                              return
                            }
                            if (activeTab === 'given' && credit.sale_id) {
                              await supabase.from('sales').update({
                                payment_status: 'pending',
                                paid_at: null,
                              }).eq('id', credit.sale_id)
                            }
                            fetchCredits()
                            setSelectedCustomer(null)
                          }}
                          className="px-3 py-1 bg-gray-700 text-gray-300 rounded-lg text-xs transition hover:bg-gray-600"
                        >
                          Mark Unpaid
                        </button>
                      )}
                      <button onClick={() => { setSelectedCustomer(null); openEdit(credit) }} className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition">Edit</button>
                      <button onClick={() => { openDelete(credit) }} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition">Delete</button>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setSelectedCustomer(null)} className="w-full py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {showPayModal && selectedCredit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">✅ Mark as Paid</h2>
              <button onClick={() => setShowPayModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-400 text-xs">Customer</p>
                <p className="text-white font-medium">{selectedCredit.customer_name || selectedCredit.supplier_name}</p>
                <p className="text-gray-400 text-xs mt-1">Amount</p>
                <p className="text-green-400 font-bold">RWF {selectedCredit.amount?.toLocaleString()}</p>
                <p className="text-gray-400 text-xs mt-1">🕐 Credit Taken On</p>
                <p className="text-yellow-400 text-xs">{selectedCredit.date ? new Date(selectedCredit.date).toLocaleString() : '—'}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="cash">💵 Cash</option>
                  <option value="mtn">📱 MTN Mobile Money</option>
                  <option value="bank">🏦 Bank Transfer</option>
                  <option value="cheque">📄 Cheque</option>
                </select>
              </div>
              <p className="text-gray-400 text-xs">✅ Credit Paid On will be recorded as: <span className="text-white">{new Date().toLocaleString()}</span></p>
              <div className="flex gap-3">
                <button onClick={() => setShowPayModal(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">Cancel</button>
                <button onClick={handleMarkPaid} className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">Confirm Paid</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal — only for Credits Taken */}
      {showModal && (
        <Modal
          title={selectedCredit ? `Edit Credit Taken` : `Add Credit Taken`}
          onClose={() => setShowModal(false)}
        >
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Supplier Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="Supplier name"
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
                <p className="text-red-400 text-xl font-bold">RWF {grandTotal.toLocaleString()}</p>
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

      {/* Confirm Delete */}
      {showConfirm && !showOTP && (
        <ConfirmDialog
          message={`Are you sure you want to delete this credit?${selectedCredit?.sale_id ? ' The linked sale will also be deleted and stock restored.' : ''}`}
          onConfirm={() => { setShowConfirm(false); setShowOTP(true) }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {showOTP && (
        <OTPVerify
          actionLabel={`Delete credit for: ${selectedCredit?.customer_name || selectedCredit?.supplier_name}`}
          onVerified={handleDelete}
          onCancel={() => setShowOTP(false)}
        />
      )}

      {/* Export Modal */}
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