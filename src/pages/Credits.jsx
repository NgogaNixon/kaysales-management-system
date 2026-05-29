import { useEffect, useState } from 'react'
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
  const [form, setForm] = useState({
    name: '',
    product_name: '',
    quantity: '',
    amount: '',
    date: '',
    notes: '',
    status: 'unpaid',
  })

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
    setForm({ name: '', product_name: '', quantity: '', amount: '', date: '', notes: '', status: 'unpaid' })
    setError('')
    setShowModal(true)
  }

  const openEdit = (credit) => {
    setSelectedCredit(credit)
    setForm({
      name: activeTab === 'given' ? credit.customer_name : credit.supplier_name,
      product_name: credit.product_name || '',
      quantity: credit.quantity || '',
      amount: credit.amount || '',
      date: credit.date ? credit.date.split('T')[0] : '',
      notes: credit.notes || '',
      status: credit.status || 'unpaid',
    })
    setError('')
    setShowModal(true)
  }

  const openDelete = (credit) => {
    setSelectedCredit(credit)
    setShowConfirm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.amount) {
      setError('Name and amount are required')
      return
    }
    setSaving(true)
    setError('')

    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    const nameField = activeTab === 'given' ? 'customer_name' : 'supplier_name'

    const data = {
      [nameField]: form.name,
      product_name: form.product_name,
      quantity: parseInt(form.quantity) || 0,
      amount: parseInt(form.amount),
      date: form.date || new Date().toISOString(),
      notes: form.notes,
      status: form.status,
      user_id: profile.id,
    }

    if (selectedCredit) {
      await supabase.from(table).update(data).eq('id', selectedCredit.id)
    } else {
      await supabase.from(table).insert(data)
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
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
          >
            + Add Credit
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-2xl">📤</span>
            <p className="text-2xl font-bold text-yellow-400 mt-2">RWF {totalGiven.toLocaleString()}</p>
            <p className="text-gray-400 text-sm mt-1">Total Given</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-2xl">⏳</span>
            <p className="text-2xl font-bold text-orange-400 mt-2">RWF {unpaidGiven.toLocaleString()}</p>
            <p className="text-gray-400 text-sm mt-1">Unpaid Given</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-2xl">📥</span>
            <p className="text-2xl font-bold text-red-400 mt-2">RWF {totalTaken.toLocaleString()}</p>
            <p className="text-gray-400 text-sm mt-1">Total Taken</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-2xl">💸</span>
            <p className="text-2xl font-bold text-red-300 mt-2">RWF {unpaidTaken.toLocaleString()}</p>
            <p className="text-gray-400 text-sm mt-1">Unpaid Taken</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('given')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'given'
                ? 'bg-yellow-500 text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            📤 Credits Given ({creditsGiven.length})
          </button>
          <button
            onClick={() => setActiveTab('taken')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'taken'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            📥 Credits Taken ({creditsTaken.length})
          </button>
        </div>

        {/* Credits Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading credits...</p>
            </div>
          ) : currentCredits.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-3">No credits found</p>
              <button
                onClick={openAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
              >
                Add First Credit
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">
                      {activeTab === 'given' ? 'Customer' : 'Supplier'}
                    </th>
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
          <div className="space-y-4">
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">
                {activeTab === 'given' ? 'Customer Name *' : 'Supplier Name *'}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder={activeTab === 'given' ? 'Customer name' : 'Supplier name'}
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Product Name</label>
              <input
                type="text"
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="Product name"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Quantity</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Amount (RWF) *</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="Any additional notes..."
                rows={3}
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