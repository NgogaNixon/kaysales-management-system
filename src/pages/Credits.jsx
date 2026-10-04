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

  // General Edit — edit every product of a customer/supplier plus the amount
  // already paid on each, all in one place.
  const [showGeneralEdit, setShowGeneralEdit] = useState(false)
  const [generalEditItems, setGeneralEditItems] = useState([])
  const [generalEditError, setGeneralEditError] = useState('')
  const [generalSaving, setGeneralSaving] = useState(false)

  // Credits <-> Sales consistency: sales whose credits don't match them
  const [syncIssues, setSyncIssues] = useState([])
  const [syncing, setSyncing] = useState(false)

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
        // Paid credits are history, not part of the open balance — excluded from Total, same as the main list.
        const activeItems = updatedItems.filter(c => c.status !== 'paid')
        const totalAmount = activeItems.reduce((sum, c) => sum + (c.amount || 0), 0)
        const unpaidAmount = activeItems.reduce((sum, c) => sum + (c.amount || 0) - (c.paid_amount || 0), 0)
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

      // The sale is gone — remove every credit record tied to it, not just this
      // one, so a multi-product sale doesn't leave sibling credits orphaned.
      await supabase.from('credits_given').delete().eq('sale_id', selectedCredit.sale_id)
    } else {
      await supabase.from(table).delete().eq('id', selectedCredit.id)
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
    // Total mirrors the same "exclude paid" rule as the main list.
    const newTotalAmount = mergedItems
      .filter(c => c.status !== 'paid')
      .reduce((sum, c) => sum + (c.amount || 0), 0)

    setConfirmingPayment(false)
    setReceiptPayAmount('')

    if (newUnpaidAmount === 0 && statusFilter === 'unpaid') {
      setSelectedCustomer(null)
    } else {
      setSelectedCustomer({ ...selectedCustomer, items: mergedItems, unpaidAmount: newUnpaidAmount, totalAmount: newTotalAmount })
    }

    fetchCredits()
  }

  // ---- Credits <-> Sales consistency ----
  // Credits Given that came from a sale must always mirror that sale: the same
  // items and amounts, with a total equal to the sale's total. This compares
  // them (read-only) and returns, for each sale that doesn't match, exactly
  // what has to be fixed. Nothing is written until the user clicks "Fix now".
  const buildSalesSyncPlan = async () => {
    const saleIds = [...new Set(creditsGiven.filter(c => c.sale_id).map(c => c.sale_id))]
    if (saleIds.length === 0) return []

    let salesRows = []
    let itemRows = []
    for (let i = 0; i < saleIds.length; i += 50) {
      const ids = saleIds.slice(i, i + 50)
      const { data: s } = await supabase.from('sales').select('id, product_name, total, created_at').in('id', ids)
      const { data: it } = await supabase.from('sale_items').select('*').in('sale_id', ids)
      salesRows = salesRows.concat(s || [])
      itemRows = itemRows.concat(it || [])
    }

    const plans = []
    for (const sale of salesRows) {
      const items = itemRows.filter(i => i.sale_id === sale.id)
      // A sale with no saved items can't be compared safely — leave it alone
      if (items.length === 0) continue

      const credits = creditsGiven
        .filter(c => c.sale_id === sale.id)
        .slice()
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

      const itemsSum = items.reduce((sum, i) => sum + (i.total || 0), 0)
      const saleTotal = sale.total || 0

      const lines = items.map(i => ({ product_name: i.product_name || '', quantity: i.quantity_sold || 0, amount: i.total || 0 }))

      // The sale's total is the reference. If its items add up to less, the
      // difference is value that was lost from the item list.
      let addGap = 0
      let fixSaleTotal = false
      if (saleTotal > itemsSum) {
        addGap = saleTotal - itemsSum
        lines.push({ product_name: 'Other items', quantity: 1, amount: addGap })
      } else if (saleTotal < itemsSum) {
        // the items add up to more than the stored total — the total is what's stale
        fixSaleTotal = true
      }

      // Pair every sale line with its credit (same product and amount first, then same product)
      const used = new Set()
      const rows = lines.map(line => {
        const credit =
          credits.find(c => !used.has(c.id) && (c.product_name || '') === line.product_name && (c.amount || 0) === line.amount) ||
          credits.find(c => !used.has(c.id) && (c.product_name || '') === line.product_name)
        if (credit) used.add(credit.id)
        return {
          credit: credit || null,
          product_name: line.product_name,
          quantity: line.quantity,
          amount: line.amount,
          paid: credit ? (credit.paid_amount || 0) : 0,
          // marked "paid" long ago without a paid_amount recorded — leave as paid
          legacyPaid: !!credit && credit.status === 'paid' && !credit.paid_amount,
        }
      })

      // A line can never be paid more than it is worth. Move any excess to the
      // oldest lines that still owe something (same rule as Add Payment).
      let excess = 0
      for (const r of rows) {
        if (!r.legacyPaid && r.paid > r.amount) {
          excess += r.paid - r.amount
          r.paid = r.amount
        }
      }
      for (const r of rows) {
        if (excess <= 0) break
        if (r.legacyPaid) continue
        const room = r.amount - r.paid
        if (room <= 0) continue
        const add = Math.min(room, excess)
        r.paid += add
        excess -= add
      }

      const updateCredits = []
      const insertCredits = []
      for (const r of rows) {
        const newStatus = r.legacyPaid ? 'paid' : (r.amount > 0 && r.paid >= r.amount ? 'paid' : r.paid > 0 ? 'partial' : 'unpaid')
        if (!r.credit) {
          insertCredits.push({ product_name: r.product_name, quantity: r.quantity, amount: r.amount, paid_amount: r.paid, status: newStatus })
          continue
        }
        const c = r.credit
        const changed =
          (c.amount || 0) !== r.amount ||
          (c.quantity || 0) !== r.quantity ||
          (c.paid_amount || 0) !== r.paid ||
          c.status !== newStatus
        if (changed) {
          updateCredits.push({
            id: c.id,
            fields: {
              quantity: r.quantity,
              amount: r.amount,
              paid_amount: r.paid,
              status: newStatus,
              paid_at: r.paid > 0 ? (c.paid_at || null) : null,
              paid_method: r.paid > 0 ? (c.paid_method || null) : null,
            },
          })
        }
      }

      if (addGap > 0 || fixSaleTotal || updateCredits.length > 0 || insertCredits.length > 0) {
        plans.push({ saleId: sale.id, saleName: sale.product_name, saleDate: sale.created_at, addGap, fixSaleTotal, updateCredits, insertCredits })
      }
    }
    return plans
  }

  // Writes one sale's fix: restores missing item value on the sale, makes the
  // credits mirror the sale's items, and re-syncs the sale's payment status.
  const applySalesSyncPlan = async (plan) => {
    const now = new Date().toISOString()

    if (plan.addGap > 0) {
      const { error: itemError } = await supabase.from('sale_items').insert({
        sale_id: plan.saleId,
        user_id: profile.id,
        product_id: null,
        product_name: 'Other items',
        quantity_sold: 1,
        selling_price: plan.addGap,
        buying_price: 0,
        total: plan.addGap,
        is_consignment: true,
      })
      if (itemError) throw itemError
    }

    if (plan.addGap > 0 || plan.fixSaleTotal) {
      const { data: allSaleItems } = await supabase
        .from('sale_items')
        .select('total, quantity_sold')
        .eq('sale_id', plan.saleId)
      if (allSaleItems && allSaleItems.length > 0) {
        await supabase.from('sales').update({
          total: allSaleItems.reduce((sum, i) => sum + (i.total || 0), 0),
          quantity_sold: allSaleItems.reduce((sum, i) => sum + (i.quantity_sold || 0), 0),
        }).eq('id', plan.saleId)
      }
    }

    for (const u of plan.updateCredits) {
      const { error: updateError } = await supabase.from('credits_given').update(u.fields).eq('id', u.id)
      if (updateError) throw updateError
    }

    for (const c of plan.insertCredits) {
      const { error: insertError } = await supabase.from('credits_given').insert({
        user_id: profile.id,
        customer_name: plan.saleName,
        product_name: c.product_name,
        quantity: c.quantity,
        amount: c.amount,
        paid_amount: c.paid_amount,
        paid_at: c.paid_amount > 0 ? now : null,
        paid_method: c.paid_amount > 0 ? 'cash' : null,
        date: plan.saleDate || now,
        notes: 'Added to match the sale',
        status: c.status,
        sale_id: plan.saleId,
      })
      if (insertError) throw insertError
    }

    await syncSalePaymentStatus(plan.saleId)
  }

  const handleFixSalesSync = async () => {
    if (syncIssues.length === 0) return
    setSyncing(true)
    try {
      for (const plan of syncIssues) {
        await applySalesSyncPlan(plan)
      }
      await logActivity(
        profile.id,
        profile.email,
        profile.full_name,
        'Sync Credits With Sales',
        `Matched credits to their sales for: ${syncIssues.map(p => p.saleName).join(', ')}`
      )
    } catch (err) {
      alert('Could not finish matching credits to sales:\n\n' + (err?.message || String(err)))
    }
    setSyncing(false)
    await fetchCredits()
  }

  // Re-check whenever the credits are (re)loaded, so a mismatch is always flagged
  useEffect(() => {
    if (!profile?.id || loading) return
    let cancelled = false
    ;(async () => {
      try {
        const plans = await buildSalesSyncPlan()
        if (!cancelled) setSyncIssues(plans)
      } catch (err) {
        if (!cancelled) setSyncIssues([])
      }
    })()
    return () => { cancelled = true }
  }, [profile, loading, creditsGiven])

  const openGeneralEdit = () => {
    if (!selectedCustomer) return
    setGeneralEditItems(selectedCustomer.items.map(credit => ({
      id: credit.id,
      original: credit,
      product_name: credit.product_name || '',
      quantity: credit.quantity || '',
      unit_price: credit.quantity && credit.amount ? Math.round(credit.amount / credit.quantity) : '',
      amount: credit.amount || '',
      // A credit marked "paid" with no paid_amount recorded is shown as fully paid,
      // so saving never flips it back to unpaid by accident.
      paid_amount: credit.status === 'paid' && !credit.paid_amount ? (credit.amount || '') : (credit.paid_amount || ''),
    })))
    setGeneralEditError('')
    setShowGeneralEdit(true)
  }

  const closeGeneralEdit = () => {
    setShowGeneralEdit(false)
    setGeneralEditItems([])
    setGeneralEditError('')
  }

  const updateGeneralItem = (index, fields) => {
    setGeneralEditItems(items => items.map((it, i) => (i === index ? { ...it, ...fields } : it)))
  }

  const addGeneralItem = () => {
    setGeneralEditItems(items => [...items, { id: null, original: null, product_name: '', quantity: '', unit_price: '', amount: '', paid_amount: '' }])
  }

  const removeGeneralItem = (index) => {
    setGeneralEditItems(items => items.filter((_, i) => i !== index))
  }

  // Saves every change made in General Edit. Only records that actually changed
  // are written. For "Credits Given" linked to a sale, the sale item, stock and
  // sale totals/payment status are kept in sync, same as the single Edit does.
  const handleSaveGeneralEdit = async () => {
    if (!selectedCustomer) return
    const table = activeTab === 'given' ? 'credits_given' : 'credits_taken'
    const field = activeTab === 'given' ? 'customer_name' : 'supplier_name'

    // Ignore brand-new rows that were left completely blank
    const rows = generalEditItems.filter(it => it.id || it.amount || it.product_name || it.paid_amount)
    if (rows.length === 0) {
      setGeneralEditError('Nothing to save')
      return
    }
    for (const it of rows) {
      const amt = parseInt(it.amount) || 0
      const paid = parseInt(it.paid_amount) || 0
      const label = it.product_name || 'an item'
      if (amt <= 0) {
        setGeneralEditError(`Please enter an amount greater than 0 for ${label}`)
        return
      }
      if (paid < 0) {
        setGeneralEditError(`Paid amount can't be negative for ${label}`)
        return
      }
      if (paid > amt) {
        setGeneralEditError(`Paid amount can't be more than the amount for ${label}`)
        return
      }
    }

    setGeneralSaving(true)
    setGeneralEditError('')

    try {
      const now = new Date().toISOString()
      const salesToRecompute = new Set()
      const salesToSync = new Set()
      let changedCount = 0

      for (const it of rows) {
        const newAmount = parseInt(it.amount) || 0
        const newPaid = parseInt(it.paid_amount) || 0
        const newQuantity = parseInt(it.quantity) || 0
        const newName = it.product_name
        const newStatus = newPaid >= newAmount ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'

        // New product added from General Edit
        if (!it.id) {
          const { error: insertError } = await supabase.from(table).insert({
            [field]: selectedCustomer.name,
            product_name: newName,
            quantity: newQuantity,
            amount: newAmount,
            paid_amount: newPaid,
            paid_at: newPaid > 0 ? now : null,
            paid_method: newPaid > 0 ? 'cash' : null,
            date: now,
            notes: '',
            status: newStatus,
            user_id: profile.id,
          })
          if (insertError) throw insertError
          changedCount++
          continue
        }

        const old = it.original
        const oldPaid = old.paid_amount || 0
        const detailsChanged =
          newName !== (old.product_name || '') ||
          newQuantity !== (old.quantity || 0) ||
          newAmount !== (old.amount || 0)
        const paidChanged = newPaid !== oldPaid
        const statusChanged = newStatus !== old.status
        if (!detailsChanged && !paidChanged && !statusChanged) continue

        let paidAt = old.paid_at || null
        let paidMethod = old.paid_method || null
        if (newPaid <= 0) {
          paidAt = null
          paidMethod = null
        } else {
          if (paidChanged || !paidAt) paidAt = now
          paidMethod = paidMethod || 'cash'
        }

        const { error: updateError } = await supabase.from(table).update({
          product_name: newName,
          quantity: newQuantity,
          amount: newAmount,
          status: newStatus,
          paid_amount: newPaid,
          paid_at: paidAt,
          paid_method: paidMethod,
        }).eq('id', old.id)
        if (updateError) throw updateError
        changedCount++

        if (activeTab === 'given' && old.sale_id) {
          salesToSync.add(old.sale_id)

          if (detailsChanged) {
            salesToRecompute.add(old.sale_id)

            const { data: matchingItems } = await supabase
              .from('sale_items')
              .select('*')
              .eq('sale_id', old.sale_id)
              .eq('product_name', old.product_name)

            const saleItem = matchingItems?.[0]

            if (saleItem) {
              const newSellingPrice = newQuantity > 0 ? Math.round(newAmount / newQuantity) : saleItem.selling_price

              await supabase.from('sale_items').update({
                product_name: newName,
                quantity_sold: newQuantity,
                selling_price: newSellingPrice,
                total: newAmount,
              }).eq('id', saleItem.id)

              if (!saleItem.is_consignment && saleItem.product_id) {
                const quantityDelta = newQuantity - (old.quantity || 0)
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
          }
        }
      }

      for (const saleId of salesToRecompute) {
        const { data: allSaleItems } = await supabase
          .from('sale_items')
          .select('total, quantity_sold')
          .eq('sale_id', saleId)

        if (allSaleItems && allSaleItems.length > 0) {
          const newSaleTotal = allSaleItems.reduce((sum, i) => sum + (i.total || 0), 0)
          const newSaleQuantity = allSaleItems.reduce((sum, i) => sum + (i.quantity_sold || 0), 0)
          await supabase.from('sales').update({
            product_name: selectedCustomer.name,
            total: newSaleTotal,
            quantity_sold: newSaleQuantity,
          }).eq('id', saleId)
        }
      }

      for (const saleId of salesToSync) {
        await syncSalePaymentStatus(saleId)
      }

      await logActivity(
        profile.id,
        profile.email,
        profile.full_name,
        'General Edit Credit',
        `General edit for: ${selectedCustomer.name} - ${changedCount} record(s) updated (${activeTab === 'given' ? 'Credits Given' : 'Credits Taken'})`
      )

      // Reload this customer's records so the statement shows the new numbers right away
      const { data: fresh } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', profile.id)
        .eq(field, selectedCustomer.name)
        .order('created_at', { ascending: false })

      const freshItems = fresh || []
      // Same rule as the main list: paid credits are history, not part of the open balance
      const openItems = freshItems.filter(c => c.status !== 'paid')
      const freshTotal = openItems.reduce((sum, c) => sum + (c.amount || 0), 0)
      const freshUnpaid = openItems.reduce((sum, c) => sum + (c.amount || 0) - (c.paid_amount || 0), 0)

      setGeneralSaving(false)
      closeGeneralEdit()
      fetchCredits()

      if (freshItems.length === 0 || (freshUnpaid === 0 && statusFilter === 'unpaid')) {
        setSelectedCustomer(null)
      } else {
        setSelectedCustomer({ ...selectedCustomer, items: freshItems, totalAmount: freshTotal, unpaidAmount: freshUnpaid })
      }
    } catch (err) {
      setGeneralSaving(false)
      setGeneralEditError('Failed to save changes: ' + (err?.message || String(err)))
    }
  }

  const getPaymentLabel = (method) => {
    if (method === 'mtn') return '📱 MTN Mobile Money'
    if (method === 'bank') return '🏦 Bank Transfer'
    if (method === 'cheque') return '📄 Cheque'
    return '💵 Cash'
  }

  // A4 statement in the same structure as the Sales receipt PDF: branded
  // header, details block, items table, right-aligned totals, signature/stamp
  // and a thank-you footer.
  const handleExportClientPDF = async () => {
    const label = activeTab === 'given' ? 'Customer' : 'Supplier'
    const items = selectedCustomer.items

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    // Branded header (logo, company name, phone/location/TIN)
    const headerEndY = await drawBrandedHeader(doc, profile)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Credit Statement', 14, headerEndY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    // Computed straight from the same items printed in the table below, so
    // these numbers can never drift from what the table actually shows.
    const totalAmount = items.reduce((sum, c) => sum + (c.amount || 0), 0)
    const paidSoFar = items.reduce((sum, c) => sum + (c.paid_amount || 0), 0)
    const unpaidAmount = totalAmount - paidSoFar

    // Details block — two columns
    let infoY = headerEndY + 8
    doc.text(`${label}: ${selectedCustomer.name}`, 14, infoY)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 120, infoY)
    infoY += 7
    doc.text(`Items: ${items.length}`, 14, infoY)
    doc.text(`Status: ${unpaidAmount > 0 ? 'Balance Due' : 'Fully Paid'}`, 120, infoY)

    // autoTable auto-paginates on its own for long credit lists — no truncation risk
    autoTable(doc, {
      startY: infoY + 8,
      head: [['#', 'Product', 'Qty', 'Unit Price (RWF)', 'Amount (RWF)', 'Date', 'Status', 'Paid At', 'Payment Method']],
      body: items.map((c, i) => [
        i + 1,
        c.product_name || '—',
        c.quantity || '—',
        c.quantity && c.amount ? Math.round(c.amount / c.quantity).toLocaleString() : '—',
        c.amount?.toLocaleString() || '0',
        c.date ? new Date(c.date).toLocaleDateString() : '—',
        c.status === 'paid' ? 'Paid' : c.status === 'partial' ? 'Partial' : 'Unpaid',
        c.paid_at ? new Date(c.paid_at).toLocaleString() : '—',
        c.paid_method ? (getPaymentLabel(c.paid_method) || '—') : '—',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [29, 78, 216] },
      columnStyles: {
        0: { cellWidth: 10 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    })

    let y = doc.lastAutoTable.finalY || 60

    // Keep the totals block together on one page
    if (y > pageHeight - 60) {
      doc.addPage()
      y = 20
    }

    // Totals — right-aligned under the table
    const labelX = pageWidth - 90
    const valueX = pageWidth - 14
    y += 10
    doc.setDrawColor(150)
    doc.line(labelX, y - 5, valueX, y - 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('TOTAL AMOUNT', labelX, y)
    doc.text(`RWF ${totalAmount.toLocaleString()}`, valueX, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    y += 7
    doc.text('Paid So Far', labelX, y)
    doc.text(`RWF ${paidSoFar.toLocaleString()}`, valueX, y, { align: 'right' })
    y += 7
    doc.setFont('helvetica', 'bold')
    doc.text('Balance Due', labelX, y)
    doc.text(`RWF ${unpaidAmount.toLocaleString()}`, valueX, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    // Leave room for the signature/stamp block below the totals
    if (y > pageHeight - 90) {
      doc.addPage()
      y = 20
    }

    await drawSignatureAndStamp(doc, profile, pageWidth, y + 30)

    // Thank-you footer at the bottom of the last page
    doc.setPage(doc.getNumberOfPages())
    doc.setFontSize(8)
    doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' })
    doc.text('Powered by KaySales', pageWidth / 2, pageHeight - 8, { align: 'center' })

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
      autoTable(doc, {
        startY: 40,
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

      // Computed from the same exportFiltered records printed in the table above.
      const paidSoFar = exportFiltered.reduce((sum, c) => sum + (c.paid_amount || 0), 0)
      const unpaidAmount = totalAmount - paidSoFar

      let summaryY = doc.lastAutoTable.finalY || 60
      const pageHeight = doc.internal.pageSize.getHeight()
      if (summaryY > pageHeight - 35) {
        doc.addPage()
        summaryY = 20
      }
      summaryY += 10
      doc.setFontSize(10)
      doc.text(`Total Amount: RWF ${totalAmount.toLocaleString()}`, 14, summaryY)
      summaryY += 7
      doc.text(`Paid So Far: RWF ${paidSoFar.toLocaleString()}`, 14, summaryY)
      summaryY += 7
      doc.setFontSize(11)
      doc.text(`Unpaid (Balance Due): RWF ${unpaidAmount.toLocaleString()}`, 14, summaryY)

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
    // Paid credits are settled history, not part of the open balance —
    // they no longer count toward Total or Unpaid; they still show under the Paid filter.
    if (credit.status !== 'paid') {
      acc[name].totalAmount += credit.amount || 0
      acc[name].unpaidAmount += (credit.amount || 0) - (credit.paid_amount || 0)
    }
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

  // General Edit live totals
  const generalTotal = generalEditItems.reduce((sum, i) => sum + (parseInt(i.amount) || 0), 0)
  const generalPaid = generalEditItems.reduce((sum, i) => sum + (parseInt(i.paid_amount) || 0), 0)

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

        {syncIssues.length > 0 && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-yellow-200 text-sm font-medium">
                ⚠️ {syncIssues.length} credit sale{syncIssues.length > 1 ? 's don\'t' : ' doesn\'t'} match {syncIssues.length > 1 ? 'their sale records' : 'its sale record'}
              </p>
              <p className="text-yellow-300 text-xs mt-1">
                {syncIssues.slice(0, 3).map(p => `${p.saleName}${p.addGap > 0 ? ` (RWF ${p.addGap.toLocaleString()} of items missing)` : ''}`).join(' · ')}
                {syncIssues.length > 3 ? ` · +${syncIssues.length - 3} more` : ''}
              </p>
            </div>
            <button
              onClick={handleFixSalesSync}
              disabled={syncing}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-gray-900 rounded-lg text-sm font-medium transition whitespace-nowrap"
            >
              {syncing ? 'Fixing...' : '🔧 Fix now'}
            </button>
          </div>
        )}

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
                      <p className="text-white text-sm">{credit.product_name || '—'}</p>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>
                          {credit.quantity || '—'} x RWF {credit.quantity && credit.amount ? Math.round(credit.amount / credit.quantity).toLocaleString() : '—'}
                        </span>
                        <span className="text-green-400">RWF {credit.amount?.toLocaleString()}</span>
                      </div>
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
                <div className="flex items-center justify-between">
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Manage Items</p>
                  <button onClick={openGeneralEdit} className="px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs transition">✏️ General Edit</button>
                </div>
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

      {/* General Edit — edit all products and the amount paid on each */}
      {showGeneralEdit && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl max-h-full flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">✏️ General Edit — {selectedCustomer.name}</h2>
              <button onClick={closeGeneralEdit} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
              <p className="text-gray-400 text-xs">Edit every product and the amount already paid on each. The status updates automatically.</p>
              {generalEditError && <p className="text-red-400 text-sm">{generalEditError}</p>}

              {generalEditItems.map((item, index) => {
                const amt = parseInt(item.amount) || 0
                const paid = parseInt(item.paid_amount) || 0
                const balance = Math.max(amt - paid, 0)
                const itemStatus = amt > 0 && paid >= amt ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'
                return (
                  <div key={item.id || `new-${index}`} className="bg-gray-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Item {index + 1}{!item.id ? ' (new)' : ''}</span>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${itemStatus === 'Paid' ? 'bg-green-900 text-green-300' : itemStatus === 'Partial' ? 'bg-orange-900 text-orange-300' : 'bg-red-900 text-red-300'}`}>
                          {itemStatus}
                        </span>
                        {!item.id && (
                          <button onClick={() => removeGeneralItem(index)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-gray-500 text-[10px] mb-1 block">Product</label>
                      <input
                        type="text"
                        value={item.product_name}
                        onChange={(e) => updateGeneralItem(index, { product_name: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Product name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-gray-500 text-[10px] mb-1 block">Quantity</label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const qty = e.target.value
                            const price = parseInt(item.unit_price) || 0
                            const fields = { quantity: qty }
                            if (price > 0) fields.amount = (parseInt(qty) || 0) * price
                            updateGeneralItem(index, fields)
                          }}
                          className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                          placeholder="Qty"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-[10px] mb-1 block">Unit Price (RWF)</label>
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => {
                            const price = e.target.value
                            const qty = parseInt(item.quantity) || 0
                            const fields = { unit_price: price }
                            if (qty > 0) fields.amount = qty * (parseInt(price) || 0)
                            updateGeneralItem(index, fields)
                          }}
                          className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                          placeholder="Unit Price"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-[10px] mb-1 block">Amount (RWF)</label>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => updateGeneralItem(index, { amount: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 text-green-400 px-3 py-2 rounded-lg text-sm font-medium focus:outline-none focus:border-blue-500"
                          placeholder="Total"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-[10px] mb-1 block">Amount Paid (RWF)</label>
                        <input
                          type="number"
                          value={item.paid_amount}
                          onChange={(e) => updateGeneralItem(index, { paid_amount: e.target.value })}
                          className="w-full bg-gray-700 border border-orange-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      Balance: <span className={balance > 0 ? 'text-orange-400 font-medium' : 'text-green-400 font-medium'}>RWF {balance.toLocaleString()}</span>
                    </p>
                  </div>
                )
              })}

              <button onClick={addGeneralItem} className="w-full py-2 border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 rounded-lg text-sm transition">
                + Add Another Product
              </button>

              <div className="bg-gray-800 rounded-lg px-4 py-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total Amount</span>
                  <span className="text-white font-medium">RWF {generalTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Paid So Far</span>
                  <span className="text-green-400">RWF {generalPaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white font-bold">Balance Due</span>
                  <span className={`font-bold ${generalTotal - generalPaid > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    RWF {Math.max(generalTotal - generalPaid, 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={closeGeneralEdit} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">Cancel</button>
                <button onClick={handleSaveGeneralEdit} disabled={generalSaving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium">
                  {generalSaving ? 'Saving...' : 'Save Changes'}
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
