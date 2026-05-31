import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Credits() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('given')
  const [creditsGiven, setCreditsGiven] = useState([])
  const [creditsTaken, setCreditsTaken] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [selectedCredit, setSelectedCredit] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
const [exportType, setExportType] = useState('')
const [exportFrom, setExportFrom] = useState('')
const [exportTo, setExportTo] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('unpaid')
  const [creditItems, setCreditItems] = useState([{ product_name: '', quantity: '', amount: '' }])

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
    setCreditItems([{ product_name: '', quantity: '', amount: '' }])
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
      amount: credit.amount || '',
    }])
    setError('')
    setShowModal(true)
  }

  const openDelete = (credit) => {
    setSelectedCredit(credit)
    setShowConfirm(true)
  }

  const addItem = () => {
    setCreditItems([...creditItems, { product_name: '', quantity: '', amount: '' }])
  }

  const removeItem = (index) => {
    if (creditItems.length === 1) return
    setCreditItems(creditItems.filter((_, i) => i !== index))
  }

  const updateItem = (index, field, value) => {
    const updated = [...creditItems]
    updated[index] = { ...updated[index], [field]: value }
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
      // Update single record
      await supabase.from(table).update({
        [nameField]: customerName,
        product_name: validItems.map(i => i.product_name).filter(Boolean).join(', '),
        quantity: validItems.reduce((sum, i) => sum + (parseInt(i.quantity) || 0), 0),
        amount: grandTotal,
        date: date || new Date().toISOString(),
        notes,
        status,
      }).eq('id', selectedCredit.id)
    } else {
      // Insert one record per item
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

    setSaving(false)
    setShowModal(false)
    fetchCredits()
  }

  const handleDelete = async () => {
    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    await supabase.from(table).delete().eq('id', selectedCredit.id)
    setShowConfirm(false)
    fetchCredits()
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
      if (exportFrom || exportTo) {
        doc.text(`Period: ${exportFrom || 'beginning'} to ${exportTo || 'today'}`, 14, 39)
        doc.text(`Total Amount: RWF ${totalAmount.toLocaleString()}`, 14, 46)
      } else {
        doc.text(`Total Amount: RWF ${totalAmount.toLocaleString()}`, 14, 39)
      }

      autoTable(doc, {
        startY: 55,
        head: [[activeTab === 'given' ? 'Customer' : 'Supplier', 'Product', 'Qty', 'Amount (RWF)', 'Date', 'Status']],
        body: exportFiltered.map(c => [
          c[nameField],
          c.product_name || '—',
          c.quantity || '—',
          c.amount?.toLocaleString(),
          c.date ? new Date(c.date).toLocaleDateString() : '—',
          c.status || 'unpaid',
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

  const handleStatusToggle = async (credit) => {
    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    const newStatus = credit.status === 'paid' ? 'unpaid' : 'paid'
    await supabase.from(table).update({ status: newStatus }).eq('id', credit.id)
    fetchCredits()
  }

  const currentCredits = activeTab === 'given' ? creditsGiven : creditsTaken
  const totalGiven = creditsGiven.reduce((sum, c) => sum + (c.amount || 0), 0)
  const totalTaken = creditsTaken.reduce((sum, c) => sum + (c.amount || 0), 0)
  const unpaidGiven = creditsGiven.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.amount || 0), 0)
  const unpaidTaken = creditsTaken.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.amount || 0), 0)

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
            <button
              onClick={() => { setExportType('excel'); setShowExportModal(true) }}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm transition font-medium"
            >
              📊 Excel
            </button>
            <button
              onClick={() => { setExportType('pdf'); setShowExportModal(true) }}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium"
            >
              📄 PDF
            </button>
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
            >
              + Add Credit
            </button>
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

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('given')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'given' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            📤 Credits Given ({creditsGiven.length})
          </button>
          <button
            onClick={() => setActiveTab('taken')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'taken' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            📥 Credits Taken ({creditsTaken.length})
          </button>
        </div>

        {/* Credits Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12"><p className="text-gray-400">Loading credits...</p></div>
          ) : currentCredits.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-3">No credits found</p>
              <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
                Add First Credit
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">{activeTab === 'given' ? 'Customer' : 'Supplier'}</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Product</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Qty</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Amount</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Date</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Notes</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCredits.map((credit) => (
                    <tr key={credit.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4 text-white font-medium">
                        {activeTab === 'given' ? credit.customer_name : credit.supplier_name}
                      </td>
                      <td className="px-6 py-4 text-gray-300">{credit.product_name || '—'}</td>
                      <td className="px-6 py-4 text-gray-300">{credit.quantity || '—'}</td>
                      <td className={`px-6 py-4 font-medium ${activeTab === 'given' ? 'text-yellow-400' : 'text-red-400'}`}>
                        RWF {credit.amount?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-gray-400">
                        {credit.date ? new Date(credit.date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-6 py-4 text-gray-400 max-w-xs truncate">{credit.notes || '—'}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleStatusToggle(credit)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                            credit.status === 'paid'
                              ? 'bg-green-900 text-green-300 hover:bg-green-800'
                              : 'bg-red-900 text-red-300 hover:bg-red-800'
                          }`}
                        >
                          {credit.status === 'paid' ? '✅ Paid' : '❌ Unpaid'}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(credit)}
                            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openDelete(credit)}
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
          title={selectedCredit
            ? `Edit Credit ${activeTab === 'given' ? 'Given' : 'Taken'}`
            : `Add Credit ${activeTab === 'given' ? 'Given' : 'Taken'}`}
          onClose={() => setShowModal(false)}
        >
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div>
              <label className="text-gray-400 text-sm mb-1 block">
                {activeTab === 'given' ? 'Customer Name *' : 'Supplier Name *'}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder={activeTab === 'given' ? 'Customer name' : 'Supplier name'}
              />
            </div>

            {/* Credit Items */}
            <div className="space-y-3">
              <label className="text-gray-400 text-sm block">Products</label>
              {creditItems.map((item, index) => (
                <div key={index} className="bg-gray-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs">Item {index + 1}</span>
                    {creditItems.length > 1 && (
                      <button onClick={() => removeItem(index)} className="text-red-400 hover:text-red-300 text-xs">
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={item.product_name}
                    onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Product name"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Quantity"
                    />
                    <input
                      type="number"
                      value={item.amount}
                      onChange={(e) => updateItem(index, 'amount', e.target.value)}
                      className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Amount (RWF)"
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={addItem}
                className="w-full py-2 border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 rounded-lg text-sm transition"
              >
                + Add Another Product
              </button>
            </div>

            {/* Grand Total */}
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
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-1 block">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-1 block">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="Any additional notes..."
                rows={2}
              />
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
                {saving ? 'Saving...' : selectedCredit ? 'Update' : 'Add Credit'}
              </button>
            </div>
          </div>
        </Modal>
      )}
        
        {/* Export Date Range Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">
                {exportType === 'excel' ? '📊 Export Excel' : '📄 Export PDF'}
              </h2>
              <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-gray-400 text-sm">Select date range for your report. Leave blank to export all records.</p>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">From Date</label>
                <input
                  type="date"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">To Date</label>
                <input
                  type="date"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  className={`flex-1 py-2 text-white rounded-lg transition font-medium ${
                    exportType === 'excel' ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600'
                  }`}
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {showConfirm && (
        <ConfirmDialog
          message="Are you sure you want to delete this credit entry?"
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}

    </Layout>
  )
}