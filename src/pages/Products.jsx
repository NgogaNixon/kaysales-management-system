import { useEffect, useState, useRef } from 'react'
import { logActivity } from '../lib/activityLogger'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import OTPVerify from '../components/OTPVerify'
import * as XLSX from 'xlsx'

export default function Products() {
  const { profile } = useAuth()
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
    low_stock_threshold: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (profile?.id) fetchProducts()
  }, [profile])

  const fetchProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', profile.id)
      .order('name', { ascending: true })
    const sorted = (data || []).sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
    setProducts(sorted)
    setLoading(false)
  }

  // A product's own low_stock_threshold if set, otherwise the app default of 3.
  const thresholdFor = (product) => product?.low_stock_threshold || 3

  const openAdd = () => {
    setSelectedProduct(null)
    setForm({ name: '', category: '', quantity: '', selling_price: '', buying_price: '', low_stock_threshold: '' })
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
      buying_price: product.buying_price || '',
      low_stock_threshold: product.low_stock_threshold || '',
    })
    setError('')
    setShowModal(true)
  }

  const openDelete = (product) => {
    setSelectedProduct(product)
    setShowConfirm(true)
  }

  const handleSave = async () => {
    const isEmpty = (v) => v === '' || v === null || v === undefined
    if (isEmpty(form.name) || isEmpty(form.category) || isEmpty(form.quantity) || isEmpty(form.selling_price)) {
      setError('Name, category, quantity and selling price are required')
      return
    }

    const duplicate = products.some(p =>
      p.name?.trim().toLowerCase() === form.name.trim().toLowerCase() &&
      p.id !== selectedProduct?.id
    )
    if (duplicate) {
      setError('A product with this name already exists')
      return
    }

    if (!isEmpty(form.low_stock_threshold) && parseInt(form.low_stock_threshold) < 0) {
      setError('Low stock alert number cannot be negative')
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
      buying_price: parseInt(form.buying_price) || 0,
      selling_price: parseInt(form.selling_price),
      low_stock_threshold: isEmpty(form.low_stock_threshold) ? null : parseInt(form.low_stock_threshold),
      user_id: profile.id,
    }

    if (selectedProduct) {
      await supabase.from('products').update(data).eq('id', selectedProduct.id)
    } else {
      await supabase.from('products').insert(data)
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

  const handleDownloadTemplate = () => {
    const sample = [
      { Name: 'Example Product', Category: 'General', Quantity: 10, 'Buying Price': 1000, 'Selling Price': 1500, 'Low Stock Alert': '' },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, 'KaySales_Product_Import_Template.xlsx')
  }

  const handleImportFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet)

    const existingNamesLower = new Set(products.map(p => p.name?.trim().toLowerCase()))
    const seenInFile = new Set()
    const toInsert = []
    const skipped = []

    for (const row of rows) {
      const name = String(row.Name ?? row.name ?? '').trim()
      const category = String(row.Category ?? row.category ?? '').trim()
      const rawQuantity = row.Quantity ?? row.quantity
      const rawSelling = row['Selling Price'] ?? row.selling_price
      const rawBuying = row['Buying Price'] ?? row.buying_price
      const rawThreshold = row['Low Stock Alert'] ?? row.low_stock_threshold
      const quantity = parseInt(rawQuantity)
      const sellingPrice = parseInt(rawSelling)
      const buyingPrice = rawBuying === undefined || rawBuying === '' ? 0 : parseInt(rawBuying)
      const lowStockThreshold = rawThreshold === undefined || rawThreshold === '' || rawThreshold === null
        ? null
        : parseInt(rawThreshold)

      if (!name) {
        skipped.push(`❌ Error: a row is missing a Name — skipped`)
        continue
      }
      if (!category) {
        skipped.push(`❌ Error: "${name}" is missing a Category — skipped`)
        continue
      }
      if (rawQuantity === undefined || rawQuantity === '' || isNaN(quantity)) {
        skipped.push(`❌ Error: "${name}" has an invalid or missing Quantity — skipped`)
        continue
      }
      if (quantity < 0) {
        skipped.push(`❌ Error: "${name}" has a negative Quantity — skipped`)
        continue
      }
      if (rawSelling === undefined || rawSelling === '' || isNaN(sellingPrice)) {
        skipped.push(`❌ Error: "${name}" has an invalid or missing Selling Price — skipped`)
        continue
      }
      if (sellingPrice < 0) {
        skipped.push(`❌ Error: "${name}" has a negative Selling Price — skipped`)
        continue
      }
      if (isNaN(buyingPrice) || buyingPrice < 0) {
        skipped.push(`❌ Error: "${name}" has an invalid Buying Price — skipped`)
        continue
      }
      if (lowStockThreshold !== null && (isNaN(lowStockThreshold) || lowStockThreshold < 0)) {
        skipped.push(`❌ Error: "${name}" has an invalid Low Stock Alert number — skipped`)
        continue
      }
      const nameLower = name.toLowerCase()
      if (existingNamesLower.has(nameLower)) {
        skipped.push(`❌ Error: "${name}" already exists in your product list — skipped`)
        continue
      }
      if (seenInFile.has(nameLower)) {
        skipped.push(`❌ Error: "${name}" is duplicated within the file — skipped`)
        continue
      }
      seenInFile.add(nameLower)
      toInsert.push({
        name,
        category,
        quantity,
        buying_price: buyingPrice,
        selling_price: sellingPrice,
        low_stock_threshold: lowStockThreshold,
        user_id: profile.id,
      })
    }

    if (toInsert.length > 0) {
      await supabase.from('products').insert(toInsert)
      await logActivity(
        profile.id,
        profile.email,
        profile.full_name,
        'Import Products',
        `Imported ${toInsert.length} product(s) from Excel`
      )
    }

    setImportResult({ added: toInsert.length, skipped })
    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    fetchProducts()
  }

  const handleDelete = async () => {
    await supabase.from('products').delete().eq('id', selectedProduct.id)
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

  const lowStock = products.filter(p => p.quantity < thresholdFor(p))
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
          <div className="flex items-center gap-3 flex-wrap">
            {isStandard && (
              <span className="text-xs text-yellow-400 bg-yellow-900 px-3 py-2 rounded-lg">
                Standard Plan — up to 2 categories
              </span>
            )}
            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition font-medium text-sm"
            >
              📥 Download Template
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition font-medium text-sm"
            >
              {importing ? 'Importing...' : '📤 Import Excel'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportFile}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
            >
              + Add Product
            </button>
          </div>
        </div>

        {/* Import Result Banner */}
        {importResult && (
          <div className={`rounded-xl p-4 border ${importResult.skipped.length > 0 ? 'bg-yellow-900 border-yellow-700' : 'bg-green-900 border-green-700'}`}>
            <div className="flex items-center justify-between">
              <p className={`text-sm font-medium ${importResult.skipped.length > 0 ? 'text-yellow-300' : 'text-green-300'}`}>
                ✅ {importResult.added} product{importResult.added !== 1 ? 's' : ''} imported successfully
                {importResult.skipped.length > 0 && ` — ${importResult.skipped.length} error${importResult.skipped.length !== 1 ? 's' : ''} found`}
              </p>
              <button onClick={() => setImportResult(null)} className="text-gray-400 hover:text-white text-sm">✕</button>
            </div>
            {importResult.skipped.length > 0 && (
              <ul className="mt-2 text-xs text-yellow-400 list-disc list-inside space-y-0.5">
                {importResult.skipped.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>
        )}

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
                  {p.name} — {p.quantity} left (alert at {thresholdFor(p)})
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
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Alert At</th>
                    {showProfit && (
                      <th className="text-left text-gray-400 px-6 py-4 font-medium">Buying Price</th>
                    )}
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Selling Price</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => {
                    const threshold = thresholdFor(product)
                    return (
                    <tr key={product.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4 text-white font-medium">{product.name}</td>
                      <td className="px-6 py-4 text-gray-300">{product.category || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`font-bold ${product.quantity < threshold ? 'text-orange-400' : 'text-white'}`}>
                          {product.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {product.low_stock_threshold ? product.low_stock_threshold : `${threshold} (default)`}
                      </td>
                      {showProfit && (
                        <td className="px-6 py-4 text-purple-300">RWF {(product.buying_price || 0).toLocaleString()}</td>
                      )}
                      <td className="px-6 py-4 text-gray-300">RWF {product.selling_price?.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          product.quantity === 0
                            ? 'bg-red-900 text-red-300'
                            : product.quantity < threshold
                            ? 'bg-orange-900 text-orange-300'
                            : 'bg-green-900 text-green-300'
                        }`}>
                          {product.quantity === 0 ? '❌ Out of Stock' : product.quantity < threshold ? '⚠️ Low Stock' : '✅ In Stock'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(product)} className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition">Edit</button>
                          <button onClick={() => openDelete(product)} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition">Delete</button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
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
              <label className="text-gray-400 text-sm mb-1 block">Low Stock Alert Number (optional)</label>
              <input
                type="number"
                min="0"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="Leave blank to use default (3)"
              />
              <p className="text-gray-500 text-xs mt-1">
                This product will show as "Low Stock" once quantity drops below this number. Leave blank to use the default of 3.
              </p>
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
