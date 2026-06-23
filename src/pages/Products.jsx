import { useEffect, useState } from 'react'
import { logActivity } from '../lib/activityLogger'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useError } from '../context/ErrorContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import OTPVerify from '../components/OTPVerify'

export default function Products() {
  const { profile } = useAuth()
  const { showError } = useError()
  const showProfit = profile?.show_profit === true
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showOTP, setShowOTP] = useState(false)
  const [otpAction, setOtpAction] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    name: '',
    category: '',
    quantity: '',
    selling_price: '',
    buying_price: '',
    low_stock_threshold: '3',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

 useEffect(() => {
    if (profile?.id) fetchProducts()
  }, [profile])

  useEffect(() => {
    const handleFocus = () => {
      if (profile?.id) fetchProducts()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [profile])

  const fetchProducts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', profile.id)
      .order('name', { ascending: true })
    if (error) showError('Failed to load products. Please refresh.')
    setProducts(data || [])
    setLoading(false)
  }

  const openAdd = () => {
    setSelectedProduct(null)
    setForm({ name: '', category: '', quantity: '', selling_price: '', buying_price: '' })
    setError('')
    setShowModal(true)
  }

  const openEdit = (product) => {
    setSelectedProduct(product)
    const data = {
      name: form.name,
      category: form.category,
      quantity: parseInt(form.quantity),
      buying_price: parseInt(form.buying_price) || 0,
      selling_price: parseInt(form.selling_price),
      low_stock_threshold: parseInt(form.low_stock_threshold) || 3,
      user_id: profile.id,
    }
    setError('')
    setShowModal(true)
  }

  const openDelete = (product) => {
    setSelectedProduct(product)
    setShowConfirm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.category || !form.quantity || !form.selling_price) {
      setError('Name, category, quantity and selling price are required')
      showError('Name, category, quantity and selling price are required')
      return
    }

    if (parseInt(form.quantity) < 0) {
      setError('Quantity cannot be negative')
      showError('Quantity cannot be negative')
      return
    }

    if (parseInt(form.selling_price) < 0) {
      setError('Selling price cannot be negative')
      showError('Selling price cannot be negative')
      return
    }
    // Check for duplicate product name
    const duplicate = products.find(p =>
      p.name.toLowerCase() === form.name.toLowerCase() &&
      (!selectedProduct || p.id !== selectedProduct.id)
    )
    if (duplicate) {
      setError(`A product named "${form.name}" already exists`)
      showError(`A product named "${form.name}" already exists`)
      return
    }

    const isStandard = profile?.plan_type === 'standard'
    if (!selectedProduct && isStandard && form.category) {
      const existingCategories = [...new Set(products.map(p => p.category).filter(Boolean))]
      if (existingCategories.length >= 2 && !existingCategories.includes(form.category)) {
        setError('Standard plan only allows 2 stock categories. Upgrade to Premium for more.')
        showError('Standard plan only allows 2 stock categories. Upgrade to Premium for more.')
        return
      }
    }

    setSaving(true)
    setError('')

    const data = {
      name: form.name,
      category: form.category,
      quantity: parseInt(form.quantity),
      buying_price: parseInt(form.buying_price) || 0,
      selling_price: parseInt(form.selling_price),
      user_id: profile.id,
    }

    if (selectedProduct) {
      const { error } = await supabase.from('products').update(data).eq('id', selectedProduct.id)
      if (error) {
        showError('Failed to update product. Please try again.')
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('products').insert(data)
      if (error) {
        showError('Failed to add product. Please try again.')
        setSaving(false)
        return
      }
    }

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      selectedProduct ? 'Edit Product' : 'Add Product',
      `${selectedProduct ? 'Updated' : 'Added'} product: ${form.name}`
    )

    setSaving(false)
    setShowModal(false)
    setShowOTP(false)
    fetchProducts()
  }

  const handleDelete = async () => {
    const { error } = await supabase.from('products').delete().eq('id', selectedProduct.id)
    if (error) {
      showError('Failed to delete product. Please try again.')
      setShowOTP(false)
      return
    }

    await logActivity(
      profile.id,
      profile.email,
      profile.full_name,
      'Delete Product',
      `Deleted product: ${selectedProduct.name}`
    )
    setShowOTP(false)
    setShowConfirm(false)
    fetchProducts()
  }

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  )

  const lowStock = products.filter(p => p.quantity < (p.low_stock_threshold || 3))
  const isStandard = profile?.plan_type === 'standard'

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📦 Products</h1>
            <p className="text-gray-400 text-sm mt-1">Manage your stock and inventory</p>
          </div>
          <div className="flex items-center gap-3">
            {isStandard && (
              <span className="text-xs text-yellow-400 bg-yellow-900 px-3 py-2 rounded-lg">
                Standard Plan — up to 2 categories
              </span>
            )}
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
            >
              + Add Product
            </button>
          </div>
        </div>

        {/* Stock Inventory Value - Esther only */}
        {showProfit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-blue-900 border border-blue-700 rounded-xl p-4">
              <span className="text-2xl">📦</span>
              <p className="text-blue-300 text-xl font-bold mt-2">
                RWF {products.reduce((sum, p) => sum + ((p.buying_price || 0) * (p.quantity || 0)), 0).toLocaleString()}
              </p>
              <p className="text-blue-400 text-sm mt-1">Total Stock Value (Cost)</p>
            </div>
            <div className="bg-green-900 border border-green-700 rounded-xl p-4">
              <span className="text-2xl">💰</span>
              <p className="text-green-300 text-xl font-bold mt-2">
                RWF {products.reduce((sum, p) => sum + ((p.selling_price || 0) * (p.quantity || 0)), 0).toLocaleString()}
              </p>
              <p className="text-green-400 text-sm mt-1">Total Stock Value (Selling Price)</p>
            </div>
          </div>
        )}

        {/* Low Stock Alert */}
        {lowStock.length > 0 && (
          <div className="bg-orange-900 border border-orange-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⚠️</span>
              <p className="font-bold text-orange-300">Low Stock — {lowStock.length} product{lowStock.length > 1 ? 's' : ''} running low</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStock.map((p) => (
                <span key={p.id} className="bg-orange-800 text-orange-200 px-3 py-1 rounded-full text-xs font-medium">
                  {p.name} — {p.quantity} left
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
        />

        {/* Products Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading products...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-3">No products found</p>
              <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
                Add First Product
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Name</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Category</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Qty</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Selling Price</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr key={product.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4 text-white font-medium">{product.name}</td>
                      <td className="px-6 py-4 text-gray-300">{product.category || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`font-bold ${product.quantity < 3 ? 'text-orange-400' : 'text-white'}`}>
                          {product.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-300">RWF {product.selling_price?.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          product.quantity === 0
                            ? 'bg-red-900 text-red-300'
                            : product.quantity < (product.low_stock_threshold || 3)
                            ? 'bg-orange-900 text-orange-300'
                            : 'bg-green-900 text-green-300'
                        }`}>
                          {product.quantity === 0 ? '❌ Out of Stock' : product.quantity < (product.low_stock_threshold || 3) ? '⚠️ Low Stock' : '✅ In Stock'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(product)} className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition">Edit</button>
                          <button onClick={() => openDelete(product)} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition">Delete</button>
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
          title={selectedProduct ? 'Edit Product' : 'Add Product'}
          onClose={() => setShowModal(false)}
        >
          <div className="space-y-4">
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Product Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Category *</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Quantity *</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Selling Price (RWF) *</label>
              <input
                type="number"
                value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            {showProfit && (
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Buying Price / Cost (RWF)</label>
                <input
                  type="number"
                  value={form.buying_price}
                  onChange={(e) => setForm({ ...form, buying_price: e.target.value })}
                  className="w-full bg-gray-800 border border-purple-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
            )}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Low Stock Alert Threshold</label>
              <input
                type="number"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                className="w-full bg-gray-800 border border-orange-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                placeholder="Default is 3"
                min="1"
              />
              <p className="text-gray-500 text-xs mt-1">Alert will show when stock falls below this number</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedProduct) {
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
                {saving ? 'Saving...' : selectedProduct ? 'Update' : 'Add Product'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Delete */}
      {showConfirm && !showOTP && (
        <ConfirmDialog
          message={`Are you sure you want to delete "${selectedProduct?.name}"? This cannot be undone.`}
          onConfirm={() => { setShowConfirm(false); setOtpAction('delete'); setShowOTP(true) }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* OTP / Password Verify */}
      {showOTP && (
        <OTPVerify
          actionLabel={otpAction === 'delete'
            ? `Delete product: ${selectedProduct?.name}`
            : `Edit product: ${selectedProduct?.name}`}
          onVerified={() => {
            setShowOTP(false)
            if (otpAction === 'delete') {
              handleDelete()
            } else {
              handleSave()
            }
          }}
          onCancel={() => setShowOTP(false)}
        />
      )}

    </Layout>
  )
}