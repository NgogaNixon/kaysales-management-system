import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useRecorderNames } from '../lib/useRecorderNames'
import { useApprovalGate } from '../lib/useApprovalGate'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import OTPVerify from '../components/OTPVerify'
import UndoToast from '../components/UndoToast'
import { logActivity } from '../lib/activityLogger'
import { changeStock } from '../lib/stock'
import { fetchAllRows } from '../lib/fetchAll'
import { localDate } from '../lib/dates'
import { drawBrandedHeader, drawSignatureAndStamp } from '../lib/pdfBranding'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ===== SALES REPORT HELPERS START =====
// Everything between these lines is used only by the "PDF" sales report.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const COLOR_MAIN = [79, 70, 229]
const COLOR_DARK = [30, 41, 59]
const COLOR_GRAY = [100, 116, 139]
const COLOR_LIGHT = [241, 245, 249]
const COLOR_GREEN = [22, 163, 74]
const COLOR_RED = [220, 38, 38]
const COLOR_ORANGE = [234, 88, 12]

// '2026-11-05' becomes midnight of that day in the user's own time zone.
// new Date('2026-11-05') alone would use UTC and shift the day in Rwanda.
function parseLocalDate(text) {
  const parts = text.split('-')
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

// True when the sale date is inside from..to (both days included).
// A blank from/to means no limit on that side.
function isInRange(createdAt, from, to) {
  const d = new Date(createdAt)
  if (from && d < parseLocalDate(from)) return false
  if (to) {
    const end = parseLocalDate(to)
    end.setDate(end.getDate() + 1)
    if (d >= end) return false
  }
  return true
}

function formatDate(d) {
  return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear()
}

function formatShortDate(d) {
  return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()]
}

// en-US is used on purpose: some phone languages add special space
// characters to numbers and the PDF font cannot print them.
function formatNumber(n) {
  return Math.round(n || 0).toLocaleString('en-US')
}

function formatMoney(n) {
  return 'RWF ' + formatNumber(n)
}

function shortMoney(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 10000) return Math.round(n / 1000) + 'k'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k'
  return String(Math.round(n))
}

// Percent change from "before" to "now". Returns null when there is nothing to compare with.
function percentChange(now, before) {
  if (!before) return null
  return ((now - before) / before) * 100
}

function percentText(value) {
  if (value === null) return 'n/a'
  return (value > 0 ? '+' : '') + value.toFixed(0) + '%'
}

// Rounds a number up to a clean chart top (1, 2, 5 or 10 times a power of ten)
function niceMax(value) {
  if (value <= 0) return 1
  const power = Math.pow(10, Math.floor(Math.log10(value)))
  const f = value / power
  let nice = 10
  if (f <= 1) nice = 1
  else if (f <= 2) nice = 2
  else if (f <= 5) nice = 5
  return nice * power
}

function weekdayIndex(d) {
  // JavaScript starts the week on Sunday, we start on Monday
  return (d.getDay() + 6) % 7
}

function trendWord(percent) {
  if (percent === null) return 'Not enough data'
  if (percent >= 10) return 'Rising'
  if (percent <= -10) return 'Declining'
  return 'Stable'
}

function needSpace(doc, y, height) {
  if (y + height > 278) {
    doc.addPage()
    return 18
  }
  return y
}

// "needed" = space the title AND the content under it must have on this page,
// so a title is never left alone at the bottom of a page
function sectionTitle(doc, y, text, needed) {
  y = needSpace(doc, y, needed || 24)
  doc.setFillColor(...COLOR_MAIN)
  doc.rect(14, y - 4.5, 1.8, 6, 'F')
  doc.setFont(undefined, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLOR_DARK)
  doc.text(text, 18, y)
  doc.setFont(undefined, 'normal')
  return y + 7
}

function writeText(doc, y, text, size, color, x, width) {
  doc.setFontSize(size)
  doc.setTextColor(...color)
  const lines = doc.splitTextToSize(text, width)
  y = needSpace(doc, y, lines.length * size * 0.43 + 2)
  doc.text(lines, x, y)
  return y + lines.length * size * 0.43 + 1
}

function writeBullet(doc, y, text) {
  doc.setFontSize(9.5)
  const lines = doc.splitTextToSize(text, 172)
  y = needSpace(doc, y, lines.length * 4.2 + 2)
  doc.setFillColor(...COLOR_MAIN)
  doc.circle(16.2, y - 1.1, 0.8, 'F')
  doc.setTextColor(...COLOR_DARK)
  doc.text(lines, 20, y)
  return y + lines.length * 4.2 + 1.5
}

function cutText(doc, text, maxWidth) {
  let result = String(text)
  while (result.length > 1 && doc.getTextWidth(result) > maxWidth) {
    result = result.slice(0, -1)
  }
  return result === String(text) ? result : result.trim() + '...'
}

function drawCard(doc, x, y, w, label, value, subText, subColor) {
  doc.setFillColor(...COLOR_LIGHT)
  doc.roundedRect(x, y, w, 22, 2, 2, 'F')
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_GRAY)
  doc.text(label, x + 4, y + 6)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLOR_DARK)
  doc.text(value, x + 4, y + 13)
  doc.setFont(undefined, 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...subColor)
  doc.text(subText, x + 4, y + 18.5)
}

function changeInfo(now, before) {
  const change = percentChange(now, before)
  if (change === null) {
    return { text: now > 0 ? 'No sales before' : 'No change', color: COLOR_GRAY }
  }
  return {
    text: percentText(change) + ' vs previous period',
    color: change >= 0 ? COLOR_GREEN : COLOR_RED,
  }
}

// Bars (one per label) with an optional line on top of them
function drawBarChart(doc, x, y, w, h, bars, options) {
  const labelWidth = 15
  const plotX = x + labelWidth
  const plotW = w - labelWidth
  const plotY = y + 3
  const plotH = h - 12

  let maxValue = 0
  bars.forEach(b => { if (b.value > maxValue) maxValue = b.value })
  if (options.line) options.line.forEach(v => { if (v > maxValue) maxValue = v })
  const top = niceMax(maxValue)

  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.setFontSize(7)
  doc.setTextColor(...COLOR_GRAY)
  for (let i = 0; i <= 5; i++) {
    const gy = plotY + plotH - (plotH * i) / 5
    doc.line(plotX, gy, plotX + plotW, gy)
    doc.text(shortMoney((top * i) / 5), plotX - 2, gy + 1, { align: 'right' })
  }

  const slot = plotW / bars.length
  const barW = Math.min(slot * 0.7, 14)
  let maxIndex = 0
  bars.forEach((b, i) => { if (b.value > bars[maxIndex].value) maxIndex = i })
  const labelStep = Math.ceil(bars.length / 10)

  bars.forEach((b, i) => {
    const barH = (b.value / top) * plotH
    const bx = plotX + slot * i + (slot - barW) / 2
    if (options.highlightMax && i === maxIndex && b.value > 0) doc.setFillColor(...COLOR_GREEN)
    else doc.setFillColor(...COLOR_MAIN)
    if (barH > 0) doc.rect(bx, plotY + plotH - barH, barW, barH, 'F')

    doc.setFontSize(6.5)
    doc.setTextColor(...COLOR_GRAY)
    if (i % labelStep === 0) {
      doc.text(b.label, bx + barW / 2, plotY + plotH + 4, { align: 'center' })
    }
    if (options.showValues && b.value > 0) {
      doc.text(shortMoney(b.value), bx + barW / 2, plotY + plotH - barH - 1, { align: 'center' })
    }
  })

  if (options.line) {
    doc.setDrawColor(...COLOR_ORANGE)
    doc.setLineWidth(0.6)
    for (let i = 1; i < options.line.length; i++) {
      const x1 = plotX + slot * (i - 1) + slot / 2
      const x2 = plotX + slot * i + slot / 2
      const y1 = plotY + plotH - (options.line[i - 1] / top) * plotH
      const y2 = plotY + plotH - (options.line[i] / top) * plotH
      doc.line(x1, y1, x2, y2)
    }
  }
  doc.setLineWidth(0.2)
  return y + h
}

// Horizontal bars: label on the left, bar, then the value text
function drawHorizontalBars(doc, x, y, w, rows, color) {
  const labelWidth = 52
  const maxBar = w - labelWidth - 38
  let maxValue = 0
  rows.forEach(r => { if (r.value > maxValue) maxValue = r.value })
  rows.forEach(r => {
    doc.setFontSize(8)
    doc.setTextColor(...COLOR_DARK)
    doc.text(cutText(doc, r.label, labelWidth - 3), x, y + 4)
    const barW = maxValue > 0 ? Math.max((r.value / maxValue) * maxBar, 0.5) : 0.5
    doc.setFillColor(...color)
    doc.rect(x + labelWidth, y, barW, 5, 'F')
    doc.setTextColor(...COLOR_GRAY)
    doc.text(r.text, x + labelWidth + barW + 2, y + 4)
    y += 6.8
  })
  return y + 2
}


const METHOD_NAMES = { cash: 'Cash', mtn: 'MTN', bank: 'Bank', cheque: 'Cheque', credit: 'Credit' }
const STATUS_NAMES = { paid: 'Paid', partial: 'Partial', pending: 'Pending' }

// Money really received for one sale. Credit sales only count what was paid so far.
function amountPaidOf(sale) {
  const total = sale.total || 0
  if (sale.payment_status === 'partial' || sale.payment_status === 'pending') {
    return Math.min(sale.amount_paid || 0, total)
  }
  return total
}

function customerLabel(name) {
  return (name || '').trim() || 'Walk-in customer'
}

function twoDigits(n) {
  return String(n).padStart(2, '0')
}

// ---------- 1. Work out all the numbers for the sales report ----------

function buildSalesReport(allSales, itemsBySale, from, to) {
  const fromDate = parseLocalDate(from)
  const toDate = parseLocalDate(to)
  const dayCount = Math.round((toDate - fromDate) / 86400000) + 1

  const sales = allSales
    .filter(s => isInRange(s.created_at, from, to))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // The period just before this one, same length, for comparison
  const prevTo = new Date(fromDate)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (dayCount - 1))
  const prevSales = allSales.filter(s => isInRange(s.created_at, localDate(prevFrom), localDate(prevTo)))

  const unitsOf = (sale) => (itemsBySale[sale.id] || []).reduce((sum, i) => sum + (i.quantity_sold || 0), 0)

  const revenue = sales.reduce((sum, s) => sum + (s.total || 0), 0)
  const profit = sales.reduce((sum, s) => sum + (s.profit || 0), 0)
  const collected = sales.reduce((sum, s) => sum + amountPaidOf(s), 0)
  const outstanding = revenue - collected
  const units = sales.reduce((sum, s) => sum + unitsOf(s), 0)
  const average = sales.length > 0 ? revenue / sales.length : 0
  const collectionRate = revenue > 0 ? (collected / revenue) * 100 : 100

  const prevRevenue = prevSales.reduce((sum, s) => sum + (s.total || 0), 0)
  const prevUnits = prevSales.reduce((sum, s) => sum + unitsOf(s), 0)
  const prevAverage = prevSales.length > 0 ? prevRevenue / prevSales.length : 0

  // Every day of the period, with its sales (days without sales stay empty)
  const days = []
  for (let i = 0; i < dayCount; i++) {
    const date = new Date(fromDate)
    date.setDate(date.getDate() + i)
    days.push({ date, sales: [], revenue: 0, collected: 0 })
  }
  sales.forEach(s => {
    const d = new Date(s.created_at)
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const idx = Math.round((midnight - fromDate) / 86400000)
    if (idx >= 0 && idx < dayCount) {
      days[idx].sales.push(s)
      days[idx].revenue += s.total || 0
      days[idx].collected += amountPaidOf(s)
    }
  })
  const dayRevenue = days.map(d => d.revenue)
  const quietDays = days.filter(d => d.sales.length === 0).length
  let peakIndex = 0
  dayRevenue.forEach((v, i) => { if (v > dayRevenue[peakIndex]) peakIndex = i })

  // Trend: daily average of the first half against the second half
  const half = Math.floor(dayCount / 2)
  let trendPercent = null
  if (half >= 2) {
    const firstSum = dayRevenue.slice(0, half).reduce((a, b) => a + b, 0)
    const secondSum = dayRevenue.slice(half).reduce((a, b) => a + b, 0)
    trendPercent = percentChange(secondSum / (dayCount - half), firstSum / half)
  }

  // Chart buckets: daily for short periods, weekly or monthly for longer ones
  let mode = 'day'
  if (dayCount > 120) mode = 'month'
  else if (dayCount > 45) mode = 'week'
  const bucketMap = new Map()
  days.forEach((day, i) => {
    let key = String(i)
    let label = formatShortDate(day.date)
    if (mode === 'week') {
      key = String(Math.floor(i / 7))
    } else if (mode === 'month') {
      key = day.date.getFullYear() + '-' + day.date.getMonth()
      label = MONTHS[day.date.getMonth()] + ' ' + String(day.date.getFullYear()).slice(2)
    }
    if (!bucketMap.has(key)) bucketMap.set(key, { label, value: 0 })
    bucketMap.get(key).value += day.revenue
  })
  const buckets = Array.from(bucketMap.values())
  let movingAverage = null
  if (mode === 'day' && dayCount >= 7) {
    movingAverage = dayRevenue.map((v, i) => {
      const part = dayRevenue.slice(Math.max(0, i - 6), i + 1)
      return part.reduce((a, b) => a + b, 0) / part.length
    })
  }

  // Average revenue for each weekday
  const weekdaySum = new Array(7).fill(0)
  const weekdayTimes = new Array(7).fill(0)
  days.forEach(day => {
    const w = weekdayIndex(day.date)
    weekdaySum[w] += day.revenue
    weekdayTimes[w] += 1
  })
  const weekdayData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, w) => ({
    label,
    value: weekdayTimes[w] > 0 ? weekdaySum[w] / weekdayTimes[w] : 0,
  }))
  let bestWeekday = 0
  weekdayData.forEach((w, i) => { if (w.value > weekdayData[bestWeekday].value) bestWeekday = i })
  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  // Number of sales in each hour of the day
  const hourCounts = new Array(24).fill(0)
  sales.forEach(s => { hourCounts[new Date(s.created_at).getHours()] += 1 })
  let firstHour = 24
  let lastHour = -1
  hourCounts.forEach((c, h) => {
    if (c > 0 && h < firstHour) firstHour = h
    if (c > 0 && h > lastHour) lastHour = h
  })
  const hourData = []
  for (let h = firstHour; h <= lastHour; h++) {
    hourData.push({ label: twoDigits(h) + ':00', value: hourCounts[h] })
  }
  let busiestHour = firstHour
  for (let h = firstHour; h <= lastHour; h++) {
    if (hourCounts[h] > hourCounts[busiestHour]) busiestHour = h
  }

  // Payment methods and payment status
  const methodMap = {}
  const statusMap = { paid: { count: 0, value: 0 }, partial: { count: 0, value: 0 }, pending: { count: 0, value: 0 } }
  sales.forEach(s => {
    const key = s.payment_method || 'cash'
    if (!methodMap[key]) methodMap[key] = { name: METHOD_NAMES[key] || key, value: 0, count: 0 }
    methodMap[key].value += s.total || 0
    methodMap[key].count += 1
    const status = s.payment_status === 'partial' || s.payment_status === 'pending' ? s.payment_status : 'paid'
    statusMap[status].count += 1
    statusMap[status].value += s.total || 0
  })
  const methods = Object.values(methodMap).sort((a, b) => b.value - a.value)

  // Customers. A customer is "new" when the first sale ever recorded is inside this period.
  const firstSeen = {}
  allSales.forEach(s => {
    const key = customerLabel(s.product_name).toLowerCase()
    const d = new Date(s.created_at)
    if (!firstSeen[key] || d < firstSeen[key]) firstSeen[key] = d
  })
  const customerMap = {}
  sales.forEach(s => {
    const key = customerLabel(s.product_name).toLowerCase()
    if (!customerMap[key]) {
      customerMap[key] = { key, name: customerLabel(s.product_name), count: 0, units: 0, total: 0, paid: 0, last: null, methods: {} }
    }
    const c = customerMap[key]
    c.count += 1
    c.units += unitsOf(s)
    c.total += s.total || 0
    c.paid += amountPaidOf(s)
    const d = new Date(s.created_at)
    if (!c.last || d > c.last) c.last = d
    const m = s.payment_method || 'cash'
    c.methods[m] = (c.methods[m] || 0) + 1
  })
  const customers = Object.values(customerMap).sort((a, b) => b.total - a.total)
  customers.forEach(c => {
    let best = 'cash'
    Object.keys(c.methods).forEach(m => { if (c.methods[m] > c.methods[best] || !c.methods[best]) best = m })
    c.mainMethod = METHOD_NAMES[best] || best
    c.isNew = firstSeen[c.key] >= fromDate
  })
  const newCustomers = customers.filter(c => c.isNew).length
  const repeatCustomers = customers.filter(c => c.count >= 2).length

  // Products
  const productMap = {}
  sales.forEach(s => {
    ;(itemsBySale[s.id] || []).forEach(item => {
      const name = item.product_name || 'Unnamed item'
      if (!productMap[name]) productMap[name] = { name, qty: 0, revenue: 0, buyers: {} }
      productMap[name].qty += item.quantity_sold || 0
      productMap[name].revenue += item.total || 0
      productMap[name].buyers[customerLabel(s.product_name).toLowerCase()] = true
    })
  })
  const productList = Object.values(productMap).sort((a, b) => b.revenue - a.revenue)
  const itemsRevenue = productList.reduce((sum, p) => sum + p.revenue, 0)

  // Money still to collect, grouped by how old the sale is
  const today = new Date()
  const ageGroups = [
    { name: '0 - 7 days', value: 0, count: 0 },
    { name: '8 - 30 days', value: 0, count: 0 },
    { name: '31 - 60 days', value: 0, count: 0 },
    { name: 'Over 60 days', value: 0, count: 0 },
  ]
  const unpaid = []
  sales.forEach(s => {
    const balance = (s.total || 0) - amountPaidOf(s)
    if (balance <= 0) return
    const age = Math.max(0, Math.floor((today - new Date(s.created_at)) / 86400000))
    const group = age <= 7 ? 0 : age <= 30 ? 1 : age <= 60 ? 2 : 3
    ageGroups[group].value += balance
    ageGroups[group].count += 1
    unpaid.push({ sale: s, balance, age })
  })
  unpaid.sort((a, b) => b.balance - a.balance)

  // Plain sentences for the highlights
  const change = percentChange(revenue, prevRevenue)
  const insights = []
  if (sales.length > 0) {
    if (change === null) {
      insights.push(`There were no sales in the previous ${dayCount} days, so there is nothing to compare with.`)
    } else {
      insights.push(`Revenue is ${Math.abs(change).toFixed(0)}% ${change >= 0 ? 'higher' : 'lower'} than the previous ${dayCount} days (${formatMoney(prevRevenue)}).`)
    }
    if (trendPercent !== null) {
      insights.push(`Trend: ${trendWord(trendPercent).toLowerCase()}. The daily average in the second half of the period is ${Math.abs(trendPercent).toFixed(0)}% ${trendPercent >= 0 ? 'above' : 'below'} the first half.`)
    }
    insights.push(`Best day was ${formatDate(days[peakIndex].date)} with ${formatMoney(dayRevenue[peakIndex])}. On average ${weekdayNames[bestWeekday]} is the strongest weekday and the busiest hour is ${twoDigits(busiestHour)}:00.`)
    if (quietDays > 0) insights.push(`${quietDays} of ${dayCount} days had no sales.`)
    insights.push(`${formatNumber(customers.length)} customers were served: ${newCustomers} new and ${customers.length - newCustomers} returning. ${repeatCustomers} bought more than once in this period.`)
    if (customers.length >= 4) {
      const top3 = customers.slice(0, 3).reduce((sum, c) => sum + c.total, 0)
      const share = revenue > 0 ? (top3 / revenue) * 100 : 0
      insights.push(`The 3 biggest customers bring ${share.toFixed(0)}% of revenue.${share >= 60 ? ' The business depends on a few customers, so keep them satisfied.' : ''}`)
    }
    if (methods.length > 0) {
      insights.push(`Most money came through ${methods[0].name} (${formatMoney(methods[0].value)}, ${((methods[0].value / revenue) * 100).toFixed(0)}% of revenue).`)
    }
    if (outstanding > 0) {
      insights.push(`${formatMoney(outstanding)} (${(100 - collectionRate).toFixed(0)}% of revenue) is still to be collected from credit sales. The collection rate is ${collectionRate.toFixed(0)}%.`)
    } else {
      insights.push('All sales of this period are fully paid. The collection rate is 100%.')
    }
  }

  return {
    from, to, fromDate, toDate, dayCount, prevFrom, prevTo,
    sales, days, revenue, profit, collected, outstanding, units, average, collectionRate,
    prevRevenue, prevCount: prevSales.length, prevUnits, prevAverage, change,
    trendPercent, buckets, movingAverage, peakIndex, quietDays,
    weekdayData, hourData, methods, statusMap, customers, newCustomers, repeatCustomers,
    productList, itemsRevenue, ageGroups, unpaid, insights,
  }
}

// ---------- 2. Build the whole sales report PDF ----------

async function makeSalesReportPdf(profile, preparedBy, allSales, itemsBySale, recorderNames, showRecorder, from, to, showProfit) {
  const data = buildSalesReport(allSales, itemsBySale, from, to)
  const companyName = profile?.company_name || 'KaySales Management System'
  const doc = new jsPDF()

  let y = await drawBrandedHeader(doc, profile)

  // Title banner
  doc.setFillColor(...COLOR_DARK)
  doc.roundedRect(14, y, 182, 20, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(14)
  doc.text('SALES REPORT', 19, y + 8)
  doc.setFont(undefined, 'normal')
  doc.setFontSize(9)
  doc.text(`${formatDate(data.fromDate)} to ${formatDate(data.toDate)}  (${data.dayCount} day${data.dayCount > 1 ? 's' : ''})`, 19, y + 14)
  doc.setFontSize(8)
  doc.text('Complete record of sales, customers and payments', 19, y + 18)
  const now = new Date()
  const generated = formatDate(now) + ', ' + twoDigits(now.getHours()) + ':' + twoDigits(now.getMinutes())
  doc.text('Generated: ' + generated, 191, y + 14, { align: 'right' })
  doc.text('Ref: SR-' + from.replace(/-/g, '') + '-' + to.replace(/-/g, ''), 191, y + 18, { align: 'right' })
  y += 28

  // Executive summary in words
  y = sectionTitle(doc, y, 'Executive summary', 40)
  if (data.sales.length === 0) {
    y = writeText(doc, y, 'No sales were recorded in this period.', 10, COLOR_GRAY, 14, 182) + 3
  } else {
    let summary = `Between ${formatDate(data.fromDate)} and ${formatDate(data.toDate)}, ${companyName} recorded ${formatNumber(data.sales.length)} sale${data.sales.length > 1 ? 's' : ''} to ${formatNumber(data.customers.length)} customer${data.customers.length > 1 ? 's' : ''}, worth ${formatMoney(data.revenue)}`
    if (data.change !== null) summary += `, which is ${Math.abs(data.change).toFixed(0)}% ${data.change >= 0 ? 'more' : 'less'} than the previous ${data.dayCount} days`
    summary += `. ${formatMoney(data.collected)} (${data.collectionRate.toFixed(0)}%) has been collected`
    summary += data.outstanding > 0 ? ` and ${formatMoney(data.outstanding)} is still owed by customers.` : ', nothing is owed.'
    if (showProfit) summary += ` The profit recorded on these sales is ${formatMoney(data.profit)} (${data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(0) : 0}% of revenue).`
    y = writeText(doc, y, summary, 10, COLOR_DARK, 14, 182) + 3
  }

  // Summary cards
  const cardW = 58
  const gap = 4
  const revChange = changeInfo(data.revenue, data.prevRevenue)
  const countChange = changeInfo(data.sales.length, data.prevCount)
  const unitsChange = changeInfo(data.units, data.prevUnits)
  const avgChange = changeInfo(data.average, data.prevAverage)
  y = needSpace(doc, y, 80)
  drawCard(doc, 14, y, cardW, 'TOTAL REVENUE', formatMoney(data.revenue), revChange.text, revChange.color)
  drawCard(doc, 14 + cardW + gap, y, cardW, 'SALES MADE', formatNumber(data.sales.length), countChange.text, countChange.color)
  drawCard(doc, 14 + (cardW + gap) * 2, y, cardW, 'UNITS SOLD', formatNumber(data.units), unitsChange.text, unitsChange.color)
  y += 26
  drawCard(doc, 14, y, cardW, 'AVERAGE SALE', formatMoney(data.average), avgChange.text, avgChange.color)
  drawCard(doc, 14 + cardW + gap, y, cardW, 'MONEY COLLECTED', formatMoney(data.collected),
    `${data.collectionRate.toFixed(0)}% collection rate`, data.collectionRate >= 90 ? COLOR_GREEN : COLOR_ORANGE)
  drawCard(doc, 14 + (cardW + gap) * 2, y, cardW, 'STILL TO COLLECT', formatMoney(data.outstanding),
    data.outstanding > 0 ? `${data.unpaid.length} unpaid sale${data.unpaid.length > 1 ? 's' : ''}` : 'Everything is paid',
    data.outstanding > 0 ? COLOR_ORANGE : COLOR_GREEN)
  y += 26
  drawCard(doc, 14, y, cardW, 'CUSTOMERS SERVED', formatNumber(data.customers.length),
    `${data.newCustomers} new, ${data.customers.length - data.newCustomers} returning`, COLOR_GRAY)
  drawCard(doc, 14 + cardW + gap, y, cardW, 'BEST DAY', formatMoney(data.days[data.peakIndex].revenue),
    formatDate(data.days[data.peakIndex].date), COLOR_GRAY)
  if (showProfit) {
    const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0
    drawCard(doc, 14 + (cardW + gap) * 2, y, cardW, 'TOTAL PROFIT', formatMoney(data.profit),
      `${margin.toFixed(0)}% margin`, data.profit >= 0 ? COLOR_GREEN : COLOR_RED)
  } else {
    drawCard(doc, 14 + (cardW + gap) * 2, y, cardW, 'DAYS WITH SALES', `${data.dayCount - data.quietDays} of ${data.dayCount}`,
      data.quietDays > 0 ? `${data.quietDays} quiet day${data.quietDays > 1 ? 's' : ''}` : 'Sales every day', COLOR_GRAY)
  }
  y += 32

  if (data.sales.length > 0) {
    // Highlights
    y = sectionTitle(doc, y, 'Business highlights', 40)
    data.insights.forEach(text => { y = writeBullet(doc, y, text) })
    y += 4

    // Revenue trend
    const modeText = data.buckets.length === data.dayCount ? 'per day' : data.dayCount > 120 ? 'per month' : 'per week'
    y = sectionTitle(doc, y, 'Revenue trend', 82)
    y = drawBarChart(doc, 14, y, 182, 62, data.buckets, {
      line: data.movingAverage,
      highlightMax: true,
      showValues: data.buckets.length <= 12,
    })
    let chartNote = `Bars show revenue ${modeText} (green = highest). `
    if (data.movingAverage) chartNote += 'Orange line = 7 day average, the real direction without the daily ups and downs. '
    chartNote += `Overall trend: ${trendWord(data.trendPercent)}${data.trendPercent !== null ? ' (' + percentText(data.trendPercent) + ')' : ''}.`
    y = writeText(doc, y + 2, chartNote, 8, COLOR_GRAY, 14, 182) + 5

    // How customers paid
    y = sectionTitle(doc, y, 'How customers paid', data.methods.length * 6.8 + 16)
    y = drawHorizontalBars(doc, 14, y, 182, data.methods.map(m => ({
      label: `${m.name} (${m.count} sale${m.count > 1 ? 's' : ''})`,
      value: m.value,
      text: `${formatMoney(m.value)} (${((m.value / data.revenue) * 100).toFixed(0)}%)`,
    })), COLOR_ORANGE)

    y = sectionTitle(doc, y + 2, 'Payment status of the sales', 40)
    y = drawHorizontalBars(doc, 14, y, 182, ['paid', 'partial', 'pending'].map(key => ({
      label: `${STATUS_NAMES[key]} (${data.statusMap[key].count} sale${data.statusMap[key].count === 1 ? '' : 's'})`,
      value: data.statusMap[key].value,
      text: `${formatMoney(data.statusMap[key].value)} (${((data.statusMap[key].value / data.revenue) * 100).toFixed(0)}%)`,
    })), COLOR_GREEN)

    // When the business sells
    y = sectionTitle(doc, y + 2, 'Which weekday sells best', 75)
    y = drawBarChart(doc, 14, y, 182, 52, data.weekdayData, { highlightMax: true, showValues: true })
    y = writeText(doc, y + 2, 'Average revenue on each weekday of this period (green = strongest).', 8, COLOR_GRAY, 14, 182) + 5

    if (data.hourData.length > 1) {
      y = sectionTitle(doc, y, 'Which hour of the day is busiest', 75)
      y = drawBarChart(doc, 14, y, 182, 52, data.hourData, { highlightMax: true, showValues: true })
      y = writeText(doc, y + 2, 'Number of sales made in each hour of the day (green = busiest hour).', 8, COLOR_GRAY, 14, 182) + 5
    }

    // Customers
    y = sectionTitle(doc, y, 'Customers', 45)
    const shownCustomers = data.customers.slice(0, 30)
    autoTable(doc, {
      startY: y,
      margin: { top: 18, bottom: 20, left: 14, right: 14 },
      head: [['#', 'Customer', 'Sales', 'Units', 'Total (RWF)', 'Owes (RWF)', 'Share', 'Usual payment', 'Last buy']],
      body: shownCustomers.map((c, i) => [
        i + 1, c.name + (c.isNew ? ' (new)' : ''), c.count, formatNumber(c.units), formatNumber(c.total),
        formatNumber(c.total - c.paid), ((c.total / data.revenue) * 100).toFixed(1) + '%', c.mainMethod, formatShortDate(c.last),
      ]),
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: COLOR_MAIN },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 7 }, 1: { cellWidth: 48 }, 2: { cellWidth: 11 }, 3: { cellWidth: 12 },
        4: { cellWidth: 25 }, 5: { cellWidth: 22 }, 6: { cellWidth: 13 }, 7: { cellWidth: 22 }, 8: { cellWidth: 22 },
      },
      didParseCell: (cell) => {
        if ([2, 3, 4, 5, 6].includes(cell.column.index)) cell.cell.styles.halign = 'right'
        if (cell.section === 'body' && cell.column.index === 5 && cell.cell.raw !== '0') cell.cell.styles.textColor = COLOR_ORANGE
      },
    })
    y = doc.lastAutoTable.finalY + 3
    if (data.customers.length > shownCustomers.length) {
      y = writeText(doc, y, `Showing the first ${shownCustomers.length} of ${data.customers.length} customers, biggest first.`, 7.5, COLOR_GRAY, 14, 182)
    }
    y += 5

    // Products moved
    const shownProducts = data.productList.slice(0, 15)
    if (shownProducts.length > 0) {
      y = sectionTitle(doc, y, 'Products that moved the business', 45)
      autoTable(doc, {
        startY: y,
        margin: { top: 18, bottom: 20, left: 14, right: 14 },
        head: [['#', 'Product', 'Units', 'Avg price (RWF)', 'Revenue (RWF)', 'Share', 'Buyers']],
        body: shownProducts.map((p, i) => [
          i + 1, p.name, formatNumber(p.qty), formatNumber(p.qty > 0 ? p.revenue / p.qty : 0), formatNumber(p.revenue),
          (data.itemsRevenue > 0 ? (p.revenue / data.itemsRevenue) * 100 : 0).toFixed(1) + '%', Object.keys(p.buyers).length,
        ]),
        styles: { fontSize: 8, cellPadding: 1.6 },
        headStyles: { fillColor: COLOR_MAIN },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 7 }, 1: { cellWidth: 64 }, 2: { cellWidth: 15 }, 3: { cellWidth: 28 }, 4: { cellWidth: 30 }, 5: { cellWidth: 18 }, 6: { cellWidth: 20 } },
        didParseCell: (cell) => {
          if (cell.column.index >= 2) cell.cell.styles.halign = 'right'
        },
      })
      y = doc.lastAutoTable.finalY + 3
      y = writeText(doc, y, 'Products are ranked by the money they earned. Buyers = number of different customers who bought the product.', 7.5, COLOR_GRAY, 14, 182) + 5
    }

    // Money still owed, by age
    if (data.unpaid.length > 0) {
      y = sectionTitle(doc, y, 'Money still to collect - by age of the sale', 60)
      y = drawHorizontalBars(doc, 14, y, 182, data.ageGroups.map(g => ({
        label: `${g.name} (${g.count} sale${g.count === 1 ? '' : 's'})`,
        value: g.value,
        text: formatMoney(g.value),
      })), COLOR_RED)
      const shownUnpaid = data.unpaid.slice(0, 10)
      autoTable(doc, {
        startY: y,
        margin: { top: 18, bottom: 20, left: 14, right: 14 },
        head: [['Customer', 'Sale date', 'Total (RWF)', 'Paid (RWF)', 'Balance (RWF)', 'Age (days)']],
        body: shownUnpaid.map(u => [
          customerLabel(u.sale.product_name), formatDate(new Date(u.sale.created_at)), formatNumber(u.sale.total),
          formatNumber(amountPaidOf(u.sale)), formatNumber(u.balance), u.age,
        ]),
        styles: { fontSize: 8, cellPadding: 1.6 },
        headStyles: { fillColor: COLOR_DARK },
        columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 28 } },
        didParseCell: (cell) => {
          if (cell.column.index >= 2) cell.cell.styles.halign = 'right'
        },
      })
      y = doc.lastAutoTable.finalY + 3
      y = writeText(doc, y, `The ${shownUnpaid.length} biggest balances are listed${data.unpaid.length > shownUnpaid.length ? ` (of ${data.unpaid.length})` : ''}. Age counts the days from the sale date until this report.`, 7.5, COLOR_GRAY, 14, 182) + 5
    }
  }

  // Daily ledger: every day, every sale, every customer
  doc.addPage()
  y = 18
  y = sectionTitle(doc, y, 'Daily sales ledger - every day, every customer', 40)
  y = writeText(doc, y, 'Each day shows its sales in time order: the customer, the products with quantity and price, how the customer paid and whether the sale is fully paid.', 8, COLOR_GRAY, 14, 182) + 2

  const ledger = []
  data.days.forEach(day => {
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day.date.getDay()]
    const dateText = dayName + ' ' + formatDate(day.date)
    if (day.sales.length === 0) {
      ledger.push([{ content: dateText + '  -  no sales', colSpan: 6, styles: { fillColor: [248, 250, 252], textColor: COLOR_GRAY, fontSize: 7 } }])
      return
    }
    const head = `${dateText}   |   ${day.sales.length} sale${day.sales.length > 1 ? 's' : ''}   |   Total RWF ${formatNumber(day.revenue)}   |   Collected RWF ${formatNumber(day.collected)}`
    ledger.push([{ content: head, colSpan: 6, styles: { fillColor: COLOR_DARK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 } }])
    day.sales.forEach(s => {
      const d = new Date(s.created_at)
      const items = itemsBySale[s.id] || []
      const productLines = items.length > 0
        ? items.map(i => `${i.product_name || 'Item'}  x${formatNumber(i.quantity_sold)} @ ${formatNumber(i.selling_price)} = ${formatNumber(i.total)}`).join('\n')
        : 'Item details not recorded'
      let customerText = customerLabel(s.product_name)
      if (showRecorder && s.created_by) customerText += '\nby ' + (recorderNames[s.created_by] || 'Team member')
      const paid = amountPaidOf(s)
      let totalText = formatNumber(s.total)
      if (paid < (s.total || 0)) totalText += `\nPaid ${formatNumber(paid)}\nOwes ${formatNumber((s.total || 0) - paid)}`
      ledger.push([
        twoDigits(d.getHours()) + ':' + twoDigits(d.getMinutes()),
        customerText,
        productLines,
        METHOD_NAMES[s.payment_method || 'cash'] || s.payment_method,
        STATUS_NAMES[s.payment_status] || 'Paid',
        totalText,
      ])
    })
  })
  autoTable(doc, {
    startY: y,
    margin: { top: 18, bottom: 20, left: 14, right: 14 },
    head: [['Time', 'Customer', 'Products sold', 'Method', 'Status', 'Total (RWF)']],
    body: ledger,
    rowPageBreak: 'avoid',
    styles: { fontSize: 7.5, cellPadding: 1.5, valign: 'top' },
    headStyles: { fillColor: COLOR_MAIN },
    columnStyles: {
      0: { cellWidth: 11 }, 1: { cellWidth: 32 }, 2: { cellWidth: 74 },
      3: { cellWidth: 17 }, 4: { cellWidth: 16 }, 5: { cellWidth: 32, halign: 'right' },
    },
    didParseCell: (cell) => {
      if (cell.section === 'head' && cell.column.index === 5) cell.cell.styles.halign = 'right'
      if (cell.section === 'body' && cell.column.index === 4 && typeof cell.cell.raw === 'string') {
        if (cell.cell.raw === 'Paid') cell.cell.styles.textColor = COLOR_GREEN
        else if (cell.cell.raw === 'Partial') cell.cell.styles.textColor = COLOR_ORANGE
        else cell.cell.styles.textColor = COLOR_RED
      }
    },
  })
  y = doc.lastAutoTable.finalY + 6

  // How to read the numbers
  y = needSpace(doc, y, 40)
  y = sectionTitle(doc, y, 'About these numbers', 30)
  const notes = [
    'Revenue is the full value of every sale in the period, including credit sales that are not paid yet.',
    'Money collected is what customers have really paid. Still to collect = revenue minus money collected.',
    'The previous period used for comparison has the same number of days and ends the day before this period starts.',
    'A customer is counted as new when the first sale ever recorded for that name falls inside this period.',
  ]
  if (showProfit) notes.push('Profit is the profit recorded on each sale after extra fees.')
  notes.forEach(text => { y = writeBullet(doc, y, text) })
  y += 4
  y = writeText(doc, y, `Prepared by: ${preparedBy || companyName}`, 9, COLOR_DARK, 14, 182)

  // Signature and stamp at the bottom of the last page
  if (profile?.signature_url || profile?.stamp_url) {
    if (y > 250) doc.addPage()
    await drawSignatureAndStamp(doc, profile, 210, 270)
  }

  // Header and footer on every page
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR_GRAY)
    if (i > 1) {
      doc.text(`${companyName} - Sales Report ${formatDate(data.fromDate)} to ${formatDate(data.toDate)}`, 14, 10)
    }
    doc.setDrawColor(226, 232, 240)
    doc.line(14, 284, 196, 284)
    doc.text(companyName, 14, 289)
    doc.text(`Page ${i} of ${pageCount}`, 105, 289, { align: 'center' })
    doc.text('Powered by KaySales', 196, 289, { align: 'right' })
  }

  return doc
}
// ===== SALES REPORT HELPERS END =====

// Database errors that mean the save_sale function is missing or does not fit the tables.
// Only then the previous step-by-step way of saving is used, so selling never stops.
const SALE_FUNCTION_PROBLEM_CODES = ['PGRST202', '42883', '42703', '42804', '42P01', '42601', '42725', '42P10']
const isSaleFunctionProblem = (error) =>
  SALE_FUNCTION_PROBLEM_CODES.includes(error?.code) ||
  /could not find the function/i.test(error?.message || '')

export default function Sales() {
  const { profile, myProfile, canWrite, canView, isOrgStaff, isCeo } = useAuth()
  // In a company, each sale shows the person who recorded it
  const recorderNames = useRecorderNames()
  const showRecorder = isCeo || isOrgStaff
  const { gate, approvalDialog, consumeApproval } = useApprovalGate()
  // The owner's profit switch decides whether profit is RECORDED on every sale (also
  // for company staff). Whether it is SHOWN also needs the financial permission.
  const profitTracking = profile?.show_profit === true
  const showProfit = profitTracking && canView('financials')
  // View-only company staff can read sales but not record, change or remove them
  const canEdit = canWrite('sales')
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
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedSale, setSelectedSale] = useState(null)
  const [pendingEditSale, setPendingEditSale] = useState(null)
  const [receiptSale, setReceiptSale] = useState(null)
  const [receiptItems, setReceiptItems] = useState([])
  const [search, setSearch] = useState('')
  const getMonthStart = () => {
    const d = new Date()
    return localDate(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const getMonthEnd = () => {
    const d = new Date()
    return localDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  }
  const [dateFrom, setDateFrom] = useState(getMonthStart())
  const [dateTo, setDateTo] = useState(getMonthEnd())
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saleDate, setSaleDate] = useState(localDate(new Date()))
  const [saleItems, setSaleItems] = useState([{ product_id: '', product_name: '', quantity_sold: '', selling_price: '', buying_price: '', total: 0, is_consignment: false }])
const [extraFees, setExtraFees] = useState('')
  const [amountPaidNow, setAmountPaidNow] = useState('')
const [productSearch, setProductSearch] = useState({})
const [showProductDropdown, setShowProductDropdown] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [showUndoToast, setShowUndoToast] = useState(false)
  const [saleItemsBySale, setSaleItemsBySale] = useState({})
  // Staff edit: the approval used to open the editor, used up only once the edit is saved
  const [editApprovalId, setEditApprovalId] = useState(null)

  useEffect(() => {
    if (profile?.id) {
      fetchSales()
      fetchProducts()
      fetchAllSaleItems()
    }
  }, [profile])

  // If something fails to load we keep the data already on the screen and say so.
  // Empty lists would look like "no sales", which would be wrong.
  const loadFailedText = 'Some of your data could not be loaded. Please check your internet connection and try again.'

  const reloadAll = () => {
    setLoadError('')
    fetchSales()
    fetchProducts()
    fetchAllSaleItems()
  }

  const fetchAllSaleItems = async () => {
    const { data, error } = await fetchAllRows(() =>
      supabase.from('sale_items').select('*').eq('user_id', profile.id)
    )
    if (error) {
      setLoadError(loadFailedText)
      return
    }
    const grouped = {}
    ;(data || []).forEach(item => {
      if (!grouped[item.sale_id]) grouped[item.sale_id] = []
      grouped[item.sale_id].push(item)
    })
    setSaleItemsBySale(grouped)
  }

  const fetchSales = async () => {
    setLoading(true)
    const { data, error } = await fetchAllRows(() =>
      supabase.from('sales').select('*').eq('user_id', profile.id).order('created_at', { ascending: false })
    )
    if (error) {
      setLoadError(loadFailedText)
      setLoading(false)
      return
    }
    setSales(data || [])
    setLoading(false)
  }

  const fetchProducts = async () => {
    const { data, error } = await fetchAllRows(() =>
      supabase.from('products').select('*').eq('user_id', profile.id)
    )
    if (error) {
      setLoadError(loadFailedText)
      return
    }
    setProducts(data || [])
  }

  const openAdd = () => {
    setSelectedSale(null)
    setPendingEditSale(null)
    setCustomerName('')
    setPaymentMethod('cash')
    setSaleDate(localDate(new Date()))
    setSaleItems([{ product_id: '', product_name: '', quantity_sold: '', selling_price: '', buying_price: '', total: 0, is_consignment: false }])
    setExtraFees('')
    setAmountPaidNow('')
    setError('')
    setShowModal(true)
  }

  const openEditForm = async (sale) => {
    setSelectedSale(sale)
    setPendingEditSale(sale)
    setCustomerName(sale.product_name)
    setPaymentMethod(sale.payment_method || 'cash')
    setSaleDate(sale.created_at ? localDate(new Date(sale.created_at)) : localDate(new Date()))
    setExtraFees(sale.extra_fees ? String(sale.extra_fees) : '')
    setAmountPaidNow(sale.amount_paid ? String(sale.amount_paid) : '')
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
        buying_price: item.buying_price || '',
        total: item.total,
        is_consignment: item.is_consignment || false,
      })))
    } else {
      setSaleItems([{ product_id: '', product_name: '', quantity_sold: '', selling_price: '', buying_price: '', total: 0, is_consignment: false }])
    }

    setShowModal(true)
  }

  // Company staff need the owner's approval to change a sale (their password is not asked)
  const openEdit = (sale) => {
    if (!isOrgStaff) {
      openEditForm(sale)
      return
    }
    gate({
      entityType: 'sale',
      entityId: sale.id,
      action: 'edit',
      summary: `Edit sale for: ${sale.product_name} (RWF ${(sale.total || 0).toLocaleString()})`,
      deferConsume: true,
      onProceed: async (approval) => {
        setEditApprovalId(approval.id)
        await openEditForm(sale)
      },
    })
  }

  const openDelete = (sale) => {
    setSelectedSale(sale)
    if (isOrgStaff) {
      gate({
        entityType: 'sale',
        entityId: sale.id,
        action: 'delete',
        summary: `Delete sale for: ${sale.product_name} (RWF ${(sale.total || 0).toLocaleString()})`,
        onProceed: async () => {
          const ok = await confirmDelete(sale)
          if (!ok) throw new Error('The sale could not be deleted. Your approval is still valid, please try again.')
        },
      })
      return
    }
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
        buying_price: product.buying_price || '',
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
  const handleBuyingPriceChange = (index, price) => {
    const updated = [...saleItems]
    updated[index] = { ...updated[index], buying_price: price }
    setSaleItems(updated)
  }

  const handleToggleConsignment = (index) => {
    const updated = [...saleItems]
    const goingConsignment = !updated[index].is_consignment
    updated[index] = {
      ...updated[index],
      is_consignment: goingConsignment,
      product_id: goingConsignment ? '' : updated[index].product_id,
      product_name: goingConsignment ? '' : updated[index].product_name,
      buying_price: goingConsignment ? '' : updated[index].buying_price,
    }
    setSaleItems(updated)
  }

  const handleConsignmentNameChange = (index, name) => {
    const updated = [...saleItems]
    updated[index] = { ...updated[index], product_name: name }
    setSaleItems(updated)
  }

  const addItem = () => {
    setSaleItems([...saleItems, { product_id: '', product_name: '', quantity_sold: '', selling_price: '', buying_price: '', total: 0, is_consignment: false }])
  }

  const removeItem = (index) => {
    if (saleItems.length === 1) return
    setSaleItems(saleItems.filter((_, i) => i !== index))
  }

  const grandTotal = saleItems.reduce((sum, item) => sum + (item.total || 0), 0)
  const totalProfit = saleItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity_sold) || 0
    const sellPrice = parseInt(item.selling_price) || 0
    const buyPrice = parseInt(item.buying_price) || 0
    return sum + ((sellPrice - buyPrice) * qty)
  }, 0) - (parseInt(extraFees) || 0)

  const handleSave = async (saleToEdit = null) => {
    const editSale = saleToEdit || pendingEditSale || selectedSale

    if (!customerName) {
      setError('Customer name is required')
      return
    }
    const validItems = saleItems.filter(i =>
      (i.is_consignment ? i.product_name : i.product_id) && i.quantity_sold && i.selling_price
    )

    // A row with a quantity or price but no product chosen used to be dropped
    // silently while still being counted in the Grand Total, so the sale total
    // and the credits no longer matched the saved items. Stop and say which one.
    const incompleteIndex = saleItems.findIndex(i =>
      !((i.is_consignment ? i.product_name : i.product_id) && i.quantity_sold && i.selling_price) &&
      (i.product_id || i.product_name || i.quantity_sold || i.selling_price)
    )
    if (incompleteIndex !== -1) {
      setError(`Item ${incompleteIndex + 1} is incomplete — choose a product from your stock (or tick Third-Party Item and type its name), then fill in quantity and price.`)
      setShowModal(true)
      return
    }

    if (validItems.length === 0) {
      setError('Please add at least one product')
      return
    }

    setSaving(true)
    setError('')

    // The sale's total always comes from the items that are actually saved, so
    // the sale, its items and its credits can never end up with different totals.
    const saleTotal = validItems.reduce((sum, i) => sum + (i.total || 0), 0)

    const paidNow = parseInt(amountPaidNow) || 0
    const paymentStatus = paymentMethod !== 'credit'
      ? 'paid'
      : paidNow >= saleTotal ? 'paid' : paidNow > 0 ? 'partial' : 'pending'
    const amountPaidValue = paymentMethod === 'credit' ? Math.min(paidNow, saleTotal) : saleTotal

    // Save the whole sale (sale, items, stock and credits) in ONE database step,
    // so a failure halfway can never leave stock or credits out of step.
    const dateChanged = editSale
      ? saleDate !== editSale.created_at?.split('T')[0]
      : saleDate !== localDate(new Date())

    const rpcResult = await supabase.rpc('save_sale', {
      p_sale_id: editSale ? String(editSale.id) : null,
      p_owner: profile.id,
      p_customer: customerName,
      p_payment_method: paymentMethod,
      p_paid_now: paidNow,
      p_sale_date: saleDate,
      p_set_date: dateChanged,
      p_items: validItems.map(item => ({
        product_id: item.is_consignment ? null : item.product_id,
        product_name: item.product_name,
        quantity_sold: parseInt(item.quantity_sold),
        selling_price: parseInt(item.selling_price),
        buying_price: parseInt(item.buying_price) || 0,
        total: item.total,
        is_consignment: !!item.is_consignment,
      })),
      p_profit_tracking: !!profitTracking,
      p_extra_fees: parseInt(extraFees) || 0,
      p_profit: totalProfit || 0,
    })

    let saleData = rpcResult.data
    let saleError = rpcResult.error

    // Only if the database function is missing or does not fit, use the previous way
    const useLegacy = Boolean(saleError) && isSaleFunctionProblem(saleError)
    if (useLegacy) {
      saleData = undefined
      saleError = null
    }

    if (useLegacy && editSale) {
      const { data: oldItems } = await supabase
        .from('sale_items')
        .select('product_id, quantity_sold, is_consignment')
        .eq('sale_id', editSale.id)

      const { data, error } = await supabase
        .from('sales')
        .update({
          product_name: customerName,
          quantity_sold: validItems.reduce((sum, i) => sum + parseInt(i.quantity_sold), 0),
          total: saleTotal,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          amount_paid: amountPaidValue,
        })
        .eq('id', editSale.id)
        .select()
        .single()
      saleData = data
      saleError = error

      if (!saleError && saleData) {
        if (saleDate !== editSale.created_at?.split('T')[0]) {
          await supabase.from('sales').update({ created_at: saleDate }).eq('id', editSale.id)
        }

        for (const oldItem of oldItems || []) {
          if (oldItem.is_consignment) continue
          await changeStock(oldItem.product_id, parseInt(oldItem.quantity_sold))
        }

        await supabase.from('sale_items').delete().eq('sale_id', editSale.id)
        const itemsToInsert = validItems.map(item => ({
          sale_id: editSale.id,
          user_id: profile.id,
          product_id: item.is_consignment ? null : item.product_id,
          product_name: item.product_name,
          quantity_sold: parseInt(item.quantity_sold),
          selling_price: parseInt(item.selling_price),
          buying_price: parseInt(item.buying_price) || 0,
          total: item.total,
          is_consignment: !!item.is_consignment,
        }))
        await supabase.from('sale_items').insert(itemsToInsert)

        for (const item of validItems) {
          if (item.is_consignment) continue
          await changeStock(item.product_id, -parseInt(item.quantity_sold))
        }

        if (profitTracking) {
          await supabase.from('sales').update({
            extra_fees: parseInt(extraFees) || 0,
            profit: totalProfit,
          }).eq('id', saleData.id)
        }

        await supabase.from('credits_given').delete().eq('sale_id', editSale.id)
        if (paymentMethod === 'credit') {
          // Allocate the actual amount paid across items without rounding drift —
          // each item but the last gets its proportional share; the last item
          // absorbs whatever remains, so the per-item amounts always sum to
          // exactly what was paid (matching sales.amount_paid).
          const amountToAllocate = Math.min(paidNow, saleTotal)
          let remaining = amountToAllocate
          for (let i = 0; i < validItems.length; i++) {
            const item = validItems[i]
            const isLast = i === validItems.length - 1
            let itemPaid
            if (isLast) {
              itemPaid = remaining
            } else {
              const share = saleTotal > 0 ? Math.round(item.total * (amountToAllocate / saleTotal)) : 0
              itemPaid = Math.min(share, remaining, item.total)
            }
            remaining -= itemPaid
            await supabase.from('credits_given').insert({
              user_id: profile.id,
              customer_name: customerName,
              product_name: item.product_name,
              quantity: parseInt(item.quantity_sold),
              amount: item.total,
              paid_amount: itemPaid,
              date: saleDate,
              notes: 'Auto-added from sale on credit',
              status: itemPaid >= item.total ? 'paid' : itemPaid > 0 ? 'partial' : 'unpaid',
              sale_id: saleData.id,
            })
          }
        }
      }
    } else if (useLegacy) {
      const { data, error } = await supabase
        .from('sales')
        .insert({
          user_id: profile.id,
          product_name: customerName,
          quantity_sold: validItems.reduce((sum, i) => sum + parseInt(i.quantity_sold), 0),
          selling_price: 0,
          total: saleTotal,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          amount_paid: amountPaidValue,
        })
        .select()
        .single()
      saleData = data
      saleError = error

      if (!saleError && saleData) {
        if (saleDate !== localDate(new Date())) {
          await supabase.from('sales').update({ created_at: saleDate }).eq('id', saleData.id)
        }

        const itemsToInsert = validItems.map(item => ({
          sale_id: saleData.id,
          user_id: profile.id,
          product_id: item.is_consignment ? null : item.product_id,
          product_name: item.product_name,
          quantity_sold: parseInt(item.quantity_sold),
          selling_price: parseInt(item.selling_price),
          buying_price: parseInt(item.buying_price) || 0,
          total: item.total,
          is_consignment: !!item.is_consignment,
        }))
        await supabase.from('sale_items').insert(itemsToInsert)

        if (profitTracking) {
          await supabase.from('sales').update({
            extra_fees: parseInt(extraFees) || 0,
            profit: totalProfit,
          }).eq('id', saleData.id)
        }

        for (const item of validItems) {
          if (item.is_consignment) continue
          await changeStock(item.product_id, -parseInt(item.quantity_sold))
        }

        if (paymentMethod === 'credit') {
          // Same rounding-safe allocation as the edit branch — last item
          // absorbs the remainder so amounts always sum exactly to what was paid.
          const amountToAllocate = Math.min(paidNow, saleTotal)
          let remaining = amountToAllocate
          for (let i = 0; i < validItems.length; i++) {
            const item = validItems[i]
            const isLast = i === validItems.length - 1
            let itemPaid
            if (isLast) {
              itemPaid = remaining
            } else {
              const share = saleTotal > 0 ? Math.round(item.total * (amountToAllocate / saleTotal)) : 0
              itemPaid = Math.min(share, remaining, item.total)
            }
            remaining -= itemPaid
            await supabase.from('credits_given').insert({
              user_id: profile.id,
              customer_name: customerName,
              product_name: item.product_name,
              quantity: parseInt(item.quantity_sold),
              amount: item.total,
              paid_amount: itemPaid,
              date: saleDate,
              notes: 'Auto-added from sale on credit',
              status: itemPaid >= item.total ? 'paid' : itemPaid > 0 ? 'partial' : 'unpaid',
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
      `${editSale ? 'Updated' : 'Added'} sale for: ${customerName} - RWF ${saleTotal.toLocaleString()} - Payment: ${paymentMethod}`
    )

    if (editApprovalId) {
      await consumeApproval(editApprovalId)
      setEditApprovalId(null)
    }

    setSaving(false)
    setShowModal(false)
    setShowOTP(false)
    setSelectedSale(null)
    setPendingEditSale(null)
    fetchSales()
    fetchAllSaleItems()
    fetchProducts()
  }

  const handleDelete = async () => {
    setShowConfirm(false)
    setPendingDelete(selectedSale)
    setShowUndoToast(true)
  }

  // Returns true when the sale was deleted
  const confirmDelete = async (target = pendingDelete) => {
    if (!target) return false

    try {
      // New way: one safe database step. Stock, credits, items and the sale
      // are removed together, or nothing is changed at all.
      const rpcResult = await supabase.rpc('delete_sale', { p_sale_id: String(target.id) })
      const deleteFunctionMissing = Boolean(rpcResult.error) && isSaleFunctionProblem(rpcResult.error)

      if (!deleteFunctionMissing) {
        if (rpcResult.error) {
          alert('Could not delete this sale:\n\n' + rpcResult.error.message)
          setPendingDelete(null)
          setShowUndoToast(false)
          return false
        }

        await logActivity(
          profile.id,
          profile.email,
          profile.full_name,
          'Delete Sale',
          `Deleted sale for: ${target.product_name} - RWF ${target.total?.toLocaleString()}`
        )

        setPendingDelete(null)
        setShowUndoToast(false)
        fetchSales()
        fetchAllSaleItems()
        fetchProducts()
        return true
      }

      // Old way, only used when the database function is not installed yet
      const { data: items } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', target.id)

      await supabase
        .from('quotations')
        .update({ sale_id: null, status: 'pending' })
        .eq('sale_id', target.id)

      // Keep Credits in sync — a deleted sale shouldn't leave an orphaned
      // credit record behind (e.g. this sale was made on credit).
      await supabase.from('credits_given').delete().eq('sale_id', target.id)

      const { error: deleteSaleError } = await supabase
        .from('sales')
        .delete()
        .eq('id', target.id)

      if (deleteSaleError) {
        alert('Could not delete this sale:\n\n' + deleteSaleError.message)
        setPendingDelete(null)
        setShowUndoToast(false)
        return false
      }

      await supabase.from('sale_items').delete().eq('sale_id', target.id)

      if (items && items.length > 0) {
        for (const item of items) {
          if (item.is_consignment) continue
          await changeStock(item.product_id, item.quantity_sold)
        }
      }

      await logActivity(
        profile.id,
        profile.email,
        profile.full_name,
        'Delete Sale',
        `Deleted sale for: ${target.product_name} - RWF ${target.total?.toLocaleString()}`
      )

      setPendingDelete(null)
      setShowUndoToast(false)
      fetchSales()
      fetchAllSaleItems()
      fetchProducts()
      return true
    } catch (err) {
      alert('Unexpected error deleting sale:\n\n' + (err?.message || String(err)))
      setPendingDelete(null)
      setShowUndoToast(false)
      return false
    }
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

  // A4 receipt in the same branded style as the credit statement, with its
  // own layout: details block, items table, right-aligned totals, then the
  // signature/stamp and a thank-you footer.
  const printReceipt = async () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    // Branded header (logo, company name, phone/location/TIN)
    const headerEndY = await drawBrandedHeader(doc, profile)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Sales Receipt', 14, headerEndY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    const paymentLabel = receiptSale.payment_method === 'mtn' ? 'MTN Mobile Money' :
      receiptSale.payment_method === 'bank' ? 'Bank Transfer' :
      receiptSale.payment_method === 'cheque' ? 'Cheque' :
      receiptSale.payment_method === 'credit' ? 'Credit' : 'Cash'
    const statusLabel = receiptSale.payment_status === 'pending' ? 'Pending' :
      receiptSale.payment_status === 'partial' ? 'Partial' : 'Paid'

    const saleTotal = receiptSale.total || 0
    const amountPaid = receiptSale.payment_status === 'paid' || !receiptSale.payment_status
      ? saleTotal
      : (receiptSale.amount_paid || 0)
    const balanceDue = Math.max(saleTotal - amountPaid, 0)

    // Details block — two columns
    let infoY = headerEndY + 8
    doc.text(`Customer: ${receiptSale.product_name}`, 14, infoY)
    doc.text(`Date: ${new Date(receiptSale.created_at).toLocaleDateString()}`, 120, infoY)
    infoY += 7
    doc.text(`Payment: ${paymentLabel}`, 14, infoY)
    doc.text(`Status: ${statusLabel}`, 120, infoY)

    // autoTable auto-paginates on its own for long item lists
    autoTable(doc, {
      startY: infoY + 8,
      head: [['#', 'Product', 'Qty', 'Unit Price (RWF)', 'Total (RWF)']],
      body: receiptItems.map((item, i) => [
        i + 1,
        item.product_name || '—',
        item.quantity_sold,
        item.selling_price?.toLocaleString() || '0',
        item.total?.toLocaleString() || '0',
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [29, 78, 216] },
      columnStyles: {
        0: { cellWidth: 12 },
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
    doc.text('GRAND TOTAL', labelX, y)
    doc.text(`RWF ${saleTotal.toLocaleString()}`, valueX, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    if (receiptSale.payment_status === 'partial' || receiptSale.payment_status === 'pending') {
      y += 7
      doc.text('Paid So Far', labelX, y)
      doc.text(`RWF ${amountPaid.toLocaleString()}`, valueX, y, { align: 'right' })
      y += 7
      doc.setFont('helvetica', 'bold')
      doc.text('Balance Due', labelX, y)
      doc.text(`RWF ${balanceDue.toLocaleString()}`, valueX, y, { align: 'right' })
      doc.setFont('helvetica', 'normal')
    }

    if (showProfit && (receiptSale.extra_fees || receiptSale.profit !== undefined)) {
      if (receiptSale.extra_fees) {
        y += 7
        doc.text('Extra Fees', labelX, y)
        doc.text(`-RWF ${receiptSale.extra_fees.toLocaleString()}`, valueX, y, { align: 'right' })
        y += 7
        doc.text('Remaining', labelX, y)
        doc.text(`RWF ${(receiptSale.total - receiptSale.extra_fees).toLocaleString()}`, valueX, y, { align: 'right' })
      }
      if (receiptSale.profit !== undefined && receiptSale.profit !== null) {
        y += 7
        doc.text('Profit Made', labelX, y)
        doc.text(`RWF ${receiptSale.profit.toLocaleString()}`, valueX, y, { align: 'right' })
      }
    }

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

    doc.save(`Receipt_${receiptSale.product_name}_${new Date(receiptSale.created_at).toLocaleDateString()}.pdf`)
  }

  // Opens the PDF report window with the dates already chosen on the page
  const openPdfExport = () => {
    setExportType('pdf')
    setExportFrom(dateFrom || getMonthStart())
    setExportTo(dateTo || localDate(new Date()))
    setExportError('')
    setShowExportModal(true)
  }

  // Quick choices inside the PDF report window
  const pickExportRange = (type) => {
    const now = new Date()
    let from = new Date(now.getFullYear(), now.getMonth(), 1)
    let to = now
    if (type === 'lastMonth') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      to = new Date(now.getFullYear(), now.getMonth(), 0)
    } else if (type === 'last30') {
      from = new Date(now)
      from.setDate(from.getDate() - 29)
    } else if (type === 'thisYear') {
      from = new Date(now.getFullYear(), 0, 1)
    }
    setExportFrom(localDate(from))
    setExportTo(localDate(to))
    setExportError('')
  }

  const handleExport = async () => {
    if (exportType === 'excel') {
      const exportFiltered = sales.filter(s => isInRange(s.created_at, exportFrom, exportTo))
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
      setShowExportModal(false)
      setExportFrom('')
      setExportTo('')
      return
    }

    // PDF report: the data on the screen must be complete
    if (loadError) {
      setExportError('Your data did not load completely, so the report would be wrong. Close this window, press "Try again" on the page and export again.')
      return
    }

    // Both dates are needed
    const today = localDate(new Date())
    if (!exportFrom || !exportTo) {
      setExportError('Please choose both the From and To dates.')
      return
    }
    if (exportFrom > today) {
      setExportError('The From date cannot be in the future.')
      return
    }
    if (exportFrom > exportTo) {
      setExportError('The From date must be before the To date.')
      return
    }
    // A period that ends in the future is cut at today
    const lastDay = exportTo > today ? today : exportTo

    setExporting(true)
    setExportError('')
    try {
      const preparedBy = (myProfile || profile)?.full_name
      const itemsBySale = saleItemsBySale
      const doc = await makeSalesReportPdf(profile, preparedBy, sales, itemsBySale, recorderNames, showRecorder, exportFrom, lastDay, showProfit)
      doc.save(`KaySales_Sales_Report_${exportFrom}_to_${lastDay}.pdf`)
      setShowExportModal(false)
      setExportFrom('')
      setExportTo('')
    } catch (err) {
      console.error('Could not create the sales report PDF:', err)
      setExportError('Could not create the PDF. Please try again.')
    }
    setExporting(false)
  }

  const filtered = sales.filter(s => {
    const items = saleItemsBySale[s.id] || []
    const matchesCustomer = s.product_name?.toLowerCase().includes(search.toLowerCase())
    const matchesProduct = items.some(i => i.product_name?.toLowerCase().includes(search.toLowerCase()))
    const matchesSearch = matchesCustomer || matchesProduct
    return matchesSearch && isInRange(s.created_at, dateFrom, dateTo)
  })

  const totalRevenue = filtered.reduce((sum, s) => sum + (s.total || 0), 0)

  return (
    <Layout>
      <div className="p-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Sales</h1>
            <p className="text-gray-400 text-sm mt-1">Record and manage your sales</p>
          </div>
          {canEdit && (
          <button onClick={openAdd} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium text-sm">
            + Record Sale
          </button>
          )}
        </div>

        {loadError && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg p-3 text-sm flex flex-wrap items-center justify-between gap-3">
            <span>{loadError}</span>
            <button onClick={reloadAll} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition font-medium">Try again</button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by customer or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface-elevated border border-surface-border text-white px-4 py-2 rounded-lg text-sm flex-1 focus:outline-none focus:border-primary"
          />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-surface-elevated border border-surface-border text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-primary" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-surface-elevated border border-surface-border text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-primary" />
          <button
            onClick={() => { setDateFrom(getMonthStart()); setDateTo(getMonthEnd()) }}
            className="px-3 py-2 bg-surface-elevated border border-surface-border text-gray-300 hover:text-white rounded-lg text-sm transition whitespace-nowrap"
          >
            This Month
          </button>
          <button onClick={() => { setExportType('excel'); setExportError(''); setShowExportModal(true) }} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm transition font-medium">Excel</button>
          <button onClick={openPdfExport} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium">PDF</button>
        </div>

        <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Total Revenue {(dateFrom || dateTo) && <span className="text-gray-500 text-xs font-normal">(filtered)</span>}</p>
            <p className="text-green-400 text-2xl font-bold">RWF {totalRevenue.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-sm">Total Sales {(dateFrom || dateTo) && <span className="text-gray-500 text-xs font-normal">(filtered)</span>}</p>
            <p className="text-white text-2xl font-bold">{filtered.length}</p>
          </div>
        </div>

        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12"><p className="text-gray-400">Loading sales...</p></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-3">No sales found</p>
              {canEdit && (
              <button onClick={openAdd} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition">Record First Sale</button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Customer</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Total</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Payment</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Status</th>
                    {showRecorder && <th className="text-left text-gray-400 px-6 py-4 font-medium">Recorded by</th>}
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Date</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sale) => (
                    <tr key={sale.id} className="border-t border-surface-border hover:bg-surface transition">
                      <td className="px-6 py-4 text-white font-medium">{sale.product_name}</td>
                      <td className="px-6 py-4 text-green-400 font-medium">RWF {sale.total?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-gray-300 text-xs">
                        {sale.payment_method === 'cash' ? 'Cash' :
                         sale.payment_method === 'mtn' ? 'MTN' :
                         sale.payment_method === 'bank' ? 'Bank' :
                         sale.payment_method === 'cheque' ? 'Cheque' :
                         sale.payment_method === 'credit' ? 'Credit' : 'Cash'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          sale.payment_status === 'paid' ? 'bg-green-900 text-green-300' :
                          sale.payment_status === 'partial' ? 'bg-orange-900 text-orange-300' :
                          sale.payment_status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                          'bg-green-900 text-green-300'
                        }`}>
                          {sale.payment_status === 'pending' ? 'Pending' :
                           sale.payment_status === 'partial' ? 'Partial' : 'Paid'}
                        </span>
                      </td>
                      {showRecorder && (
                        <td className="px-6 py-4 text-gray-300 text-xs">
                          {sale.created_by ? (recorderNames[sale.created_by] || 'Team member') : '—'}
                        </td>
                      )}
                      <td className="px-6 py-4 text-gray-400">{new Date(sale.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => generateReceipt(sale)} className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition">Receipt</button>
                          {canEdit && (
                            <>
                              <button onClick={() => openEdit(sale)} className="px-3 py-1 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs transition">Edit</button>
                              <button onClick={() => openDelete(sale)} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition">Delete</button>
                            </>
                          )}
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

      {showModal && (
        <Modal title={pendingEditSale ? 'Edit Sale' : 'Record Sale'} onClose={() => { setShowModal(false); setSelectedSale(null); setPendingEditSale(null); setEditApprovalId(null) }}>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Customer Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                placeholder="Customer name"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Sale Date</label>
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
              >
                <option value="cash">Cash</option>
                <option value="mtn">MTN Mobile Money</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="credit">Credit (Add to Credits Given)</option>
              </select>
            </div>
            {paymentMethod === 'credit' && (
              <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-3 space-y-3">
                <p className="text-yellow-300 text-xs">Whatever isn't paid now will be added to Credits Given as owed.</p>
                <div>
                  <label className="text-yellow-200 text-xs mb-1 block">Amount Paid Now (leave blank if nothing was paid)</label>
                  <input
                    type="number"
                    value={amountPaidNow}
                    onChange={(e) => setAmountPaidNow(e.target.value)}
                    className="w-full bg-surface border border-yellow-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-yellow-500"
                    placeholder="0"
                  />
                </div>
                {grandTotal > 0 && (
                  <p className="text-yellow-200 text-xs">
                    Balance remaining on credit: <span className="font-bold">RWF {Math.max(grandTotal - (parseInt(amountPaidNow) || 0), 0).toLocaleString()}</span>
                  </p>
                )}
              </div>
            )}
            <div className="space-y-3">
              <label className="text-gray-400 text-sm block">Products *</label>
              {saleItems.map((item, index) => (
                <div key={index} className="bg-surface rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs">Item {index + 1}</span>
                    {saleItems.length > 1 && (
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
                    <span className="text-gray-300 text-xs">Third-Party Item</span>
                  </label>
                  {item.is_consignment ? (
                    <input
                      type="text"
                      value={item.product_name}
                      onChange={(e) => handleConsignmentNameChange(index, e.target.value)}
                      className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
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
                        className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                        placeholder="Search your stock..."
                      />
                      {showProductDropdown[index] && (
                        <div className="absolute z-20 w-full bg-surface-elevated border border-surface-border rounded-lg mt-1 max-h-48 overflow-y-auto shadow-xl">
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
                                className="px-3 py-2 hover:bg-surface cursor-pointer text-sm text-white border-b border-surface-border last:border-0"
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
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={item.quantity_sold}
                      onChange={(e) => handleQuantityChange(index, e.target.value)}
                      className="bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                      placeholder="Quantity"
                    />
                    <input
                      type="number"
                      value={item.selling_price}
                      onChange={(e) => handlePriceChange(index, e.target.value)}
                      className="bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                      placeholder="Selling Price (RWF)"
                    />
                  </div>
                  {showProfit && (
                    <input
                      type="number"
                      value={item.buying_price}
                      onChange={(e) => handleBuyingPriceChange(index, e.target.value)}
                      className="w-full bg-surface border border-primary text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary-light"
                      placeholder={item.is_consignment ? "Amount you owe the owner (RWF)" : "Buying Price / Cost (RWF)"}
                    />
                  )}
                  {item.total > 0 && (
                    <p className="text-green-400 text-sm font-medium">Subtotal: RWF {item.total.toLocaleString()}</p>
                  )}
                </div>
              ))}
              <button onClick={addItem} className="w-full py-2 border border-dashed border-surface-border text-gray-400 hover:text-white hover:border-gray-400 rounded-lg text-sm transition">
                + Add Another Product
              </button>
            </div>
            {showProfit && (
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Extra Fees (RWF)</label>
                <input
                  type="number"
                  value={extraFees}
                  onChange={(e) => setExtraFees(e.target.value)}
                  className="w-full bg-surface border border-primary text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary-light"
                  placeholder="Transport, packaging, etc."
                />
              </div>
            )}
            {grandTotal > 0 && (
              <div className="bg-surface rounded-lg px-4 py-3">
                <p className="text-gray-400 text-sm">Grand Total</p>
                <p className="text-green-400 text-xl font-bold">RWF {grandTotal.toLocaleString()}</p>
                {showProfit && (
                  <>
                    <p className="text-gray-400 text-sm mt-2">Estimated Profit</p>
                    <p className={`text-lg font-bold ${totalProfit >= 0 ? 'text-primary-light' : 'text-red-400'}`}>
                      RWF {totalProfit.toLocaleString()}
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowModal(false); setSelectedSale(null); setPendingEditSale(null); setEditApprovalId(null) }} className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition">Cancel</button>
              <button
                onClick={() => {
                  if (pendingEditSale && !isOrgStaff) {
                    setOtpAction('edit')
                    setShowModal(false)
                    setShowOTP(true)
                  } else {
                    handleSave()
                  }
                }}
                disabled={saving}
                className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium"
              >
                {saving ? 'Saving...' : pendingEditSale ? 'Update Sale' : 'Record Sale'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showConfirm && !showOTP && (
        <ConfirmDialog
          message="Are you sure you want to delete this sale?"
          onConfirm={() => { setShowConfirm(false); setOtpAction('delete'); setShowOTP(true) }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

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

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <h2 className="text-lg font-bold text-white">{exportType === 'excel' ? 'Export Excel' : 'Export PDF'}</h2>
              <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {exportType === 'pdf' ? (
                <>
                  <p className="text-gray-400 text-sm">Choose the month or period for the sales report. It lists every day, every customer, the products sold and how each customer paid.</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => pickExportRange('thisMonth')} className="px-3 py-1 bg-surface border border-surface-border text-gray-300 hover:text-white rounded-lg text-xs transition">This month</button>
                    <button onClick={() => pickExportRange('lastMonth')} className="px-3 py-1 bg-surface border border-surface-border text-gray-300 hover:text-white rounded-lg text-xs transition">Last month</button>
                    <button onClick={() => pickExportRange('last30')} className="px-3 py-1 bg-surface border border-surface-border text-gray-300 hover:text-white rounded-lg text-xs transition">Last 30 days</button>
                    <button onClick={() => pickExportRange('thisYear')} className="px-3 py-1 bg-surface border border-surface-border text-gray-300 hover:text-white rounded-lg text-xs transition">This year</button>
                  </div>
                </>
              ) : (
                <p className="text-gray-400 text-sm">Select date range. Leave blank to export all records.</p>
              )}
              <div>
                <label className="text-gray-400 text-sm mb-1 block">From Date</label>
                <input type="date" value={exportFrom} max={exportType === 'pdf' ? localDate(new Date()) : undefined} onChange={(e) => setExportFrom(e.target.value)} className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">To Date</label>
                <input type="date" value={exportTo} max={exportType === 'pdf' ? localDate(new Date()) : undefined} onChange={(e) => setExportTo(e.target.value)} className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary" />
              </div>
              {exportError && <p className="text-red-400 text-sm">{exportError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowExportModal(false)} className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition">Cancel</button>
                <button onClick={handleExport} disabled={exporting} className={`flex-1 py-2 text-white rounded-lg transition font-medium disabled:opacity-60 ${exportType === 'excel' ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600'}`}>{exporting ? 'Preparing...' : 'Download'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReceipt && receiptSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-sm shadow-2xl max-h-full flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Sales Receipt</h2>
              <button onClick={() => setShowReceipt(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="text-center mb-4">
                {profile?.logo_url ? (
                  <img src={profile.logo_url} alt="Logo" className="w-12 h-12 object-contain mx-auto mb-2 rounded" />
                ) : (
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center mx-auto mb-2">
                    <span className="text-white font-bold">K</span>
                  </div>
                )}
                <p className="text-white font-bold">{profile?.company_name || 'KaySales Management System'}</p>
                {profile?.company_location && <p className="text-gray-500 text-xs">{profile.company_location}</p>}
                <p className="text-gray-400 text-xs">Sales Receipt</p>
              </div>
              <div className="border-t border-surface-border pt-4 space-y-2">
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
                    {receiptSale.payment_method === 'mtn' ? 'MTN Mobile Money' :
                     receiptSale.payment_method === 'bank' ? 'Bank Transfer' :
                     receiptSale.payment_method === 'cheque' ? 'Cheque' :
                     receiptSale.payment_method === 'credit' ? 'Credit' : 'Cash'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Status</span>
                  <span className={
                    receiptSale.payment_status === 'pending' ? 'text-yellow-400' :
                    receiptSale.payment_status === 'partial' ? 'text-orange-400' : 'text-green-400'
                  }>
                    {receiptSale.payment_status === 'pending' ? 'Pending' :
                     receiptSale.payment_status === 'partial' ? 'Partial' : 'Paid'}
                  </span>
                </div>
                {receiptSale.payment_status === 'partial' && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Paid So Far</span>
                      <span className="text-white">RWF {(receiptSale.amount_paid || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Balance on Credit</span>
                      <span className="text-orange-400 font-medium">RWF {(receiptSale.total - (receiptSale.amount_paid || 0)).toLocaleString()}</span>
                    </div>
                  </>
                )}
                <div className="border-t border-surface-border pt-2">
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
                <div className="border-t border-surface-border pt-2 flex justify-between">
                  <span className="text-white font-bold">GRAND TOTAL</span>
                  <span className="text-green-400 font-bold text-lg">RWF {receiptSale.total?.toLocaleString()}</span>
                </div>
                {showProfit && receiptSale.extra_fees > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Extra Fees</span>
                      <span className="text-red-400">- RWF {receiptSale.extra_fees.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Remaining</span>
                      <span className="text-white font-medium">RWF {(receiptSale.total - receiptSale.extra_fees).toLocaleString()}</span>
                    </div>
                  </>
                )}
                {showProfit && receiptSale.profit !== undefined && receiptSale.profit !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Profit Made</span>
                    <span className="text-primary-light font-medium">RWF {receiptSale.profit.toLocaleString()}</span>
                  </div>
                )}
              </div>
              {(profile?.signature_url || profile?.stamp_url) && (
                <div className="flex justify-between items-end mt-4 pt-3 border-t border-surface-border">
                  {profile?.signature_url ? (
                    <div className="text-center">
                      <img src={profile.signature_url} alt="Signature" className="h-10 object-contain mx-auto" />
                      <p className="text-gray-500 text-[10px] mt-1">Signature</p>
                    </div>
                  ) : <div />}
                  {profile?.stamp_url ? (
                    <div className="text-center">
                      <img src={profile.stamp_url} alt="Stamp" className="h-10 object-contain mx-auto" />
                      <p className="text-gray-500 text-[10px] mt-1">Company Stamp</p>
                    </div>
                  ) : <div />}
                </div>
              )}
              <div className="text-center mt-4 text-gray-500 text-xs">
                <p>Thank you for your business!</p>
                <p>Powered by KaySales</p>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowReceipt(false)} className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition">Close</button>
                <button onClick={printReceipt} className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium">Download PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUndoToast && pendingDelete && (
        <UndoToast
          message="Sale deleted — stock will be restored"
          onUndo={handleUndo}
          onExpire={() => confirmDelete()}
        />
      )}

      {approvalDialog}

    </Layout>
  )
}
