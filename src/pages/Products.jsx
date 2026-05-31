import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Products() {
  const { profile } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    name: '',
    category: '',
    quantity: '',
    selling_price: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile?.id) fetchProducts()
  }, [profile])

  const fetchProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    setProducts(data || [])
    setLoading(false)
  }

  const openAdd = () => {
    setSelectedProduct(null)
    setForm({ name: '', category: '', quantity: '', selling_price: '' })
    setError('')
    setShowModal(true)
  }

  const openEdit = (product) => {
    setSelectedProduct(product)
    setForm({
      name: product.name,
      category: product.category || '',
      quantity: product.quantity,
      selling_price: product.selling_price,
    })
    setError('')
    setShowModal(true)
  }

  const openDelete = (product) => {
    setSelectedProduct(product)
    setShowConfirm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.quantity || !form.selling_price) {
      setError('Name, quantity and selling price are required')
      return
    }

    const isStandard = profile?.plan_type === 'standard'
    if (!selectedProduct && isStandard && form.category) {
      const existingCategories = [...new Set(products.map(p => p.category).filter(Boolean))]
      if (existingCategories.length >= 2 && !existingCategories.includes(form.category)) {
        setError('Standard plan only allows 2 stock categories. Upgrade to Premium for more.')
        return
      }
    }

    setSaving(true)
    setError('')

    const data = {
      name: form.name,
      category: form.category,
      quantity: parseInt(form.quantity),
      buying_price: 0,
      selling_price: parseInt(form.selling_price),
      user_id: profile.id,
    }

    if (selectedProduct) {
      await supabase.from('products').update(data).eq('id', selectedProduct.id)
    } else {
      await supabase.from('products').insert(data)
    }

    setSaving(false)
    setShowModal(false)
    fetchProducts()
  }

  const handleDelete = async () => {
    await supabase.from('products').delete().eq('id', selectedProduct.id)
    setShowConfirm(false)
    fetchProducts()
  }

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  )

  const lowStock = products.filter(p => p.quantity < 3)
  const isStandard = profile?.plan_type === 'standard'
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))]

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
              <button
                onClick={openAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
              >
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
                            : product.quantity < 3
                            ? 'bg-orange-900 text-orange-300'
                            : 'bg-green-900 text-green-300'
                        }`}>
                          {product.quantity === 0 ? '❌ Out of Stock' : product.quantity < 3 ? '⚠️ Low Stock' : '✅ In Stock'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(product)}
                            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openDelete(product)}
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
                placeholder=""
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder=""
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Quantity *</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder=""
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Selling Price (RWF) *</label>
              <input
                type="number"
                value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder=""
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
                {saving ? 'Saving...' : selectedProduct ? 'Update' : 'Add Product'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Delete */}
      {showConfirm && (
        <ConfirmDialog
          message={`Are you sure you want to delete "${selectedProduct?.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}

    </Layout>
  )
}