import { useEffect, useState } from 'react'
import { localDate } from '../lib/dates'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawBrandedHeader, drawSignatureAndStamp } from '../lib/pdfBranding'

// ===== REPORT HELPERS START =====
// Everything below is used by the "Export PDF" report only.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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

// Compares how much of the units a product has with how much of the money it brings.
// Many units but little money = low price. Few units but a lot of money = high price.
function valueNote(p) {
  if (p.share >= p.unitShare * 1.3) return 'High price: earns more than it sells'
  if (p.unitShare >= p.share * 1.3) return 'Low price: sells many, earns less'
  return 'Balanced price and quantity'
}

function trendWord(percent) {
  if (percent === null) return 'Not enough data'
  if (percent >= 10) return 'Rising'
  if (percent <= -10) return 'Declining'
  return 'Stable'
}

// ---------- 1. Work out all the numbers for the report ----------

function buildReportData(allSales, allItems, products, from, to) {
  const fromDate = parseLocalDate(from)
  const toDate = parseLocalDate(to)
  const dayCount = Math.round((toDate - fromDate) / 86400000) + 1

  const sales = allSales.filter(s => isInRange(s.created_at, from, to))
  const saleDates = {}
  sales.forEach(s => { saleDates[s.id] = new Date(s.created_at) })
  const items = allItems.filter(i => saleDates[i.sale_id])

  // The period just before this one, same length, for comparison
  const prevTo = new Date(fromDate)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (dayCount - 1))
  const prevSales = allSales.filter(s => isInRange(s.created_at, localDate(prevFrom), localDate(prevTo)))
  const prevIds = {}
  prevSales.forEach(s => { prevIds[s.id] = true })
  const prevItems = allItems.filter(i => prevIds[i.sale_id])

  const revenue = sales.reduce((sum, s) => sum + (s.total || 0), 0)
  const profit = sales.reduce((sum, s) => sum + (s.profit || 0), 0)
  const itemsSold = items.reduce((sum, i) => sum + (i.quantity_sold || 0), 0)
  const itemsRevenue = items.reduce((sum, i) => sum + (i.total || 0), 0)
  const average = sales.length > 0 ? revenue / sales.length : 0

  const prevRevenue = prevSales.reduce((sum, s) => sum + (s.total || 0), 0)
  const prevItemsSold = prevItems.reduce((sum, i) => sum + (i.quantity_sold || 0), 0)
  const prevAverage = prevSales.length > 0 ? prevRevenue / prevSales.length : 0

  // Money really received. Credit sales that are not fully paid only count what was paid so far.
  let collected = 0
  sales.forEach(s => {
    const total = s.total || 0
    if (s.payment_status === 'partial' || s.payment_status === 'pending') {
      collected += Math.min(s.amount_paid || 0, total)
    } else {
      collected += total
    }
  })
  const outstanding = revenue - collected

  // Revenue and sales count for every day of the period (days with no sales stay 0)
  const dayRevenue = new Array(dayCount).fill(0)
  const dayCountSales = new Array(dayCount).fill(0)
  const dayIndexOf = (date) => {
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    return Math.round((midnight - fromDate) / 86400000)
  }
  sales.forEach(s => {
    const idx = dayIndexOf(saleDates[s.id])
    if (idx >= 0 && idx < dayCount) {
      dayRevenue[idx] += s.total || 0
      dayCountSales[idx] += 1
    }
  })

  // Trend: compare the daily average of the first half with the second half
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
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(fromDate)
    d.setDate(d.getDate() + i)
    let key = String(i)
    let label = formatShortDate(d)
    if (mode === 'week') {
      key = String(Math.floor(i / 7))
    } else if (mode === 'month') {
      key = d.getFullYear() + '-' + d.getMonth()
      label = MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2)
    }
    if (!bucketMap.has(key)) bucketMap.set(key, { label, value: 0, count: 0 })
    const bucket = bucketMap.get(key)
    bucket.value += dayRevenue[i]
    bucket.count += dayCountSales[i]
  }
  const buckets = Array.from(bucketMap.values())

  // 7 day moving average (only when the chart is daily)
  let movingAverage = null
  if (mode === 'day' && dayCount >= 7) {
    movingAverage = dayRevenue.map((v, i) => {
      const start = Math.max(0, i - 6)
      const part = dayRevenue.slice(start, i + 1)
      return part.reduce((a, b) => a + b, 0) / part.length
    })
  }

  // Best day and quiet days
  let peakIndex = 0
  dayRevenue.forEach((v, i) => { if (v > dayRevenue[peakIndex]) peakIndex = i })
  const peakDate = new Date(fromDate)
  peakDate.setDate(peakDate.getDate() + peakIndex)
  const quietDays = dayRevenue.filter(v => v === 0).length

  // Average revenue for each weekday (fair even if the period has more Mondays than Fridays)
  const weekdaySum = new Array(7).fill(0)
  const weekdayTimes = new Array(7).fill(0)
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(fromDate)
    d.setDate(d.getDate() + i)
    const w = weekdayIndex(d)
    weekdaySum[w] += dayRevenue[i]
    weekdayTimes[w] += 1
  }
  const weekdayData = WEEKDAYS.map((name, w) => ({
    label: name.slice(0, 3),
    value: weekdayTimes[w] > 0 ? weekdaySum[w] / weekdayTimes[w] : 0,
  }))
  let bestWeekday = 0
  weekdayData.forEach((w, i) => { if (w.value > weekdayData[bestWeekday].value) bestWeekday = i })

  // Products
  const categoryOf = {}
  products.forEach(p => { categoryOf[p.name] = p.category || 'Uncategorized' })
  const segments = Math.min(8, dayCount)
  const productMap = {}
  items.forEach(item => {
    const name = item.product_name || 'Unnamed item'
    if (!productMap[name]) {
      productMap[name] = {
        name,
        category: categoryOf[name] || 'Uncategorized',
        qty: 0,
        revenue: 0,
        orders: {},
        firstHalfQty: 0,
        secondHalfQty: 0,
        spark: new Array(segments).fill(0),
      }
    }
    const p = productMap[name]
    const qty = item.quantity_sold || 0
    const idx = Math.max(0, Math.min(dayCount - 1, dayIndexOf(saleDates[item.sale_id])))
    p.qty += qty
    p.revenue += item.total || 0
    p.orders[item.sale_id] = true
    if (idx < half) p.firstHalfQty += qty
    else p.secondHalfQty += qty
    p.spark[Math.min(Math.floor((idx * segments) / dayCount), segments - 1)] += qty
  })
  const productList = Object.values(productMap)

  // A / B / C class by revenue: A makes the first 80%, B the next 15%, C the rest
  const byRevenue = productList.slice().sort((a, b) => b.revenue - a.revenue)
  let runningShare = 0
  byRevenue.forEach(p => {
    p.share = itemsRevenue > 0 ? (p.revenue / itemsRevenue) * 100 : 0
    p.abc = runningShare < 80 ? 'A' : runningShare < 95 ? 'B' : 'C'
    runningShare += p.share
  })

  productList.forEach(p => {
    p.orderCount = Object.keys(p.orders).length
    p.avgPrice = p.qty > 0 ? p.revenue / p.qty : 0
    p.trend = '-'
    if (half >= 2) {
      const firstAvg = p.firstHalfQty / half
      const secondAvg = p.secondHalfQty / (dayCount - half)
      if (p.firstHalfQty === 0 && p.secondHalfQty > 0) {
        p.trend = 'New'
      } else if (p.firstHalfQty > 0) {
        const change = percentChange(secondAvg, firstAvg)
        p.trend = change >= 20 ? 'Up' : change <= -20 ? 'Down' : 'Steady'
      }
    }
  })
  const byQty = productList.slice().sort((a, b) => b.qty - a.qty)
  byQty.forEach((p, i) => { p.qtyRank = i + 1 })
  byRevenue.forEach((p, i) => { p.revRank = i + 1 })
  productList.forEach(p => { p.unitShare = itemsSold > 0 ? (p.qty / itemsSold) * 100 : 0 })

  // Categories, payment methods and customers
  const categoryMap = {}
  items.forEach(item => {
    const cat = categoryOf[item.product_name] || 'Uncategorized'
    categoryMap[cat] = (categoryMap[cat] || 0) + (item.total || 0)
  })
  const categories = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const methodNames = { cash: 'Cash', mtn: 'MTN', bank: 'Bank', cheque: 'Cheque', credit: 'Credit' }
  const methodMap = {}
  sales.forEach(s => {
    const key = s.payment_method || 'cash'
    if (!methodMap[key]) methodMap[key] = { name: methodNames[key] || key, value: 0, count: 0 }
    methodMap[key].value += s.total || 0
    methodMap[key].count += 1
  })
  const methods = Object.values(methodMap).sort((a, b) => b.value - a.value)

  const customerMap = {}
  sales.forEach(s => {
    const name = s.product_name || 'Walk-in customer'
    if (!customerMap[name]) customerMap[name] = { name, value: 0, count: 0 }
    customerMap[name].value += s.total || 0
    customerMap[name].count += 1
  })
  const customers = Object.values(customerMap).sort((a, b) => b.value - a.value)

  const unsold = products.map(p => p.name).filter(name => name && !productMap[name])

  // Plain sentences for the "Key insights" box
  const insights = []
  if (sales.length > 0) {
    insights.push(
      `You made ${formatNumber(sales.length)} sale${sales.length > 1 ? 's' : ''} worth ${formatMoney(revenue)} in ${dayCount} day${dayCount > 1 ? 's' : ''}, about ${formatMoney(average)} per sale and ${formatMoney(revenue / dayCount)} per day.`
    )
    const change = percentChange(revenue, prevRevenue)
    if (change === null) {
      insights.push(`There were no sales in the previous ${dayCount} days (${formatDate(prevFrom)} to ${formatDate(prevTo)}), so there is nothing to compare with.`)
    } else {
      insights.push(`Revenue is ${Math.abs(change).toFixed(0)}% ${change >= 0 ? 'higher' : 'lower'} than the previous ${dayCount} days (${formatMoney(prevRevenue)}).`)
    }
    if (trendPercent !== null) {
      insights.push(`Trend: ${trendWord(trendPercent).toLowerCase()}. The daily average in the second half of the period is ${Math.abs(trendPercent).toFixed(0)}% ${trendPercent >= 0 ? 'above' : 'below'} the first half.`)
    }
    if (byRevenue.length > 0) {
      const topRev = byRevenue[0]
      insights.push(`Top earner is ${topRev.name} with ${formatMoney(topRev.revenue)} (${topRev.share.toFixed(0)}% of item revenue).`)
    }
    if (byRevenue.length >= 4) {
      const top3 = byRevenue[0].share + byRevenue[1].share + byRevenue[2].share
      insights.push(`The 3 biggest earners bring ${top3.toFixed(0)}% of revenue.${top3 >= 70 ? ' Your income depends on very few products, so keep them well stocked.' : ''}`)
    }
    insights.push(`Best day was ${formatDate(peakDate)} with ${formatMoney(dayRevenue[peakIndex])}.${weekdayData[bestWeekday].value > 0 ? ` On average ${WEEKDAYS[bestWeekday]} is your strongest weekday.` : ''}`)
    if (quietDays > 0) {
      insights.push(`${quietDays} of ${dayCount} days had no sales at all.`)
    }
    if (outstanding > 0) {
      insights.push(`${formatMoney(outstanding)} (${((outstanding / revenue) * 100).toFixed(0)}% of revenue) is still unpaid on credit sales. Follow it up in Credits.`)
    }
    if (customers.length > 0 && customers[0].name !== 'Walk-in customer') {
      insights.push(`Biggest customer: ${customers[0].name} with ${formatMoney(customers[0].value)} in ${customers[0].count} sale${customers[0].count > 1 ? 's' : ''}.`)
    }
    if (unsold.length > 0) {
      insights.push(`${unsold.length} product${unsold.length > 1 ? 's' : ''} in your list did not sell at all in this period.`)
    }
  }

  return {
    from, to, fromDate, toDate, dayCount, prevFrom, prevTo,
    sales, items, revenue, profit, itemsSold, average, collected, outstanding,
    prevRevenue, prevCount: prevSales.length, prevItemsSold, prevAverage,
    trendPercent, mode, buckets, movingAverage,
    peakDate, peakValue: dayRevenue[peakIndex], quietDays,
    weekdayData, bestWeekday,
    byQty, byRevenue, itemsRevenue, categories, methods, customers, unsold, insights,
  }
}

// ---------- 2. Small drawing helpers ----------

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

// Two bars for each product: share of the units sold and share of the money earned
function drawCompareBars(doc, x, y, w, rows) {
  const labelWidth = 46
  const textWidth = 62
  const maxBar = w - labelWidth - textWidth
  let maxShare = 1
  rows.forEach(r => {
    if (r.unitShare > maxShare) maxShare = r.unitShare
    if (r.moneyShare > maxShare) maxShare = r.moneyShare
  })

  // legend
  doc.setFontSize(7.5)
  doc.setFillColor(...COLOR_GRAY)
  doc.rect(x, y - 2.5, 3, 3, 'F')
  doc.setTextColor(...COLOR_GRAY)
  doc.text('Share of units sold', x + 4.5, y)
  doc.setFillColor(...COLOR_GREEN)
  doc.rect(x + 40, y - 2.5, 3, 3, 'F')
  doc.text('Share of money earned', x + 44.5, y)
  y += 4

  rows.forEach(r => {
    doc.setFontSize(8)
    doc.setTextColor(...COLOR_DARK)
    doc.text(cutText(doc, r.label, labelWidth - 3), x, y + 4.5)

    const unitW = Math.max((r.unitShare / maxShare) * maxBar, 0.5)
    const moneyW = Math.max((r.moneyShare / maxShare) * maxBar, 0.5)
    doc.setFillColor(...COLOR_GRAY)
    doc.rect(x + labelWidth, y, unitW, 3.6, 'F')
    doc.setFillColor(...COLOR_GREEN)
    doc.rect(x + labelWidth, y + 4.2, moneyW, 3.6, 'F')
    doc.setFontSize(6.5)
    doc.setTextColor(...COLOR_GRAY)
    doc.text(r.unitShare.toFixed(0) + '%', x + labelWidth + unitW + 1.5, y + 3)
    doc.text(r.moneyShare.toFixed(0) + '%', x + labelWidth + moneyW + 1.5, y + 7.2)

    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR_DARK)
    doc.text(r.line1, x + w, y + 3, { align: 'right' })
    doc.setTextColor(...r.noteColor)
    doc.text(r.line2, x + w, y + 7.2, { align: 'right' })
    y += 11
  })
  return y
}

function drawSparkline(doc, x, y, w, h, values) {
  let maxValue = 0
  values.forEach(v => { if (v > maxValue) maxValue = v })
  doc.setDrawColor(...COLOR_MAIN)
  doc.setLineWidth(0.4)
  const step = values.length > 1 ? w / (values.length - 1) : 0
  const pointY = (v) => (maxValue > 0 ? y + h - (v / maxValue) * h : y + h)
  for (let i = 1; i < values.length; i++) {
    doc.line(x + step * (i - 1), pointY(values[i - 1]), x + step * i, pointY(values[i]))
  }
  doc.setFillColor(...COLOR_MAIN)
  doc.circle(x + step * (values.length - 1), pointY(values[values.length - 1]), 0.7, 'F')
  doc.setLineWidth(0.2)
}

// ---------- 3. Build the whole PDF ----------

async function makeAnalysisPdf(profile, allSales, allItems, products, from, to, showProfit) {
  const data = buildReportData(allSales, allItems, products, from, to)
  const companyName = profile?.company_name || 'KaySales Management System'
  const doc = new jsPDF()

  // Header with logo and company details
  let y = await drawBrandedHeader(doc, profile)

  // Title banner
  doc.setFillColor(...COLOR_DARK)
  doc.roundedRect(14, y, 182, 18, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(14)
  doc.text('SALES ANALYSIS REPORT', 19, y + 8)
  doc.setFont(undefined, 'normal')
  doc.setFontSize(9)
  doc.text(`${formatDate(data.fromDate)} to ${formatDate(data.toDate)}  (${data.dayCount} day${data.dayCount > 1 ? 's' : ''})`, 19, y + 14)
  const now = new Date()
  const generated = formatDate(now) + ', ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  doc.setFontSize(8)
  doc.text('Generated: ' + generated, 191, y + 14, { align: 'right' })
  y += 26

  // Summary cards
  y = sectionTitle(doc, y, 'Summary')
  const cardW = 58
  const gap = 4
  const revChange = changeInfo(data.revenue, data.prevRevenue)
  const countChange = changeInfo(data.sales.length, data.prevCount)
  const itemsChange = changeInfo(data.itemsSold, data.prevItemsSold)
  const avgChange = changeInfo(data.average, data.prevAverage)
  drawCard(doc, 14, y, cardW, 'TOTAL REVENUE', formatMoney(data.revenue), revChange.text, revChange.color)
  drawCard(doc, 14 + cardW + gap, y, cardW, 'SALES MADE', formatNumber(data.sales.length), countChange.text, countChange.color)
  drawCard(doc, 14 + (cardW + gap) * 2, y, cardW, 'ITEMS SOLD', formatNumber(data.itemsSold), itemsChange.text, itemsChange.color)
  y += 26
  drawCard(doc, 14, y, cardW, 'AVERAGE SALE', formatMoney(data.average), avgChange.text, avgChange.color)
  drawCard(doc, 14 + cardW + gap, y, cardW, 'MONEY COLLECTED', formatMoney(data.collected),
    data.outstanding > 0 ? `${formatMoney(data.outstanding)} still unpaid` : 'Everything is paid',
    data.outstanding > 0 ? COLOR_ORANGE : COLOR_GREEN)
  if (showProfit) {
    const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0
    drawCard(doc, 14 + (cardW + gap) * 2, y, cardW, 'TOTAL PROFIT', formatMoney(data.profit),
      `${margin.toFixed(0)}% margin`, data.profit >= 0 ? COLOR_GREEN : COLOR_RED)
  } else {
    drawCard(doc, 14 + (cardW + gap) * 2, y, cardW, 'BEST DAY', formatMoney(data.peakValue),
      formatDate(data.peakDate), COLOR_GRAY)
  }
  y += 30

  if (data.sales.length === 0) {
    y = writeText(doc, y, 'No sales were recorded in this period, so there is nothing to analyse. Try a longer period.', 10, COLOR_GRAY, 14, 182)
  } else {
    // Key insights
    y = sectionTitle(doc, y, 'Key insights', 40)
    data.insights.forEach(text => { y = writeBullet(doc, y, text) })
    y += 4

    // Revenue trend chart
    const modeText = data.mode === 'day' ? 'per day' : data.mode === 'week' ? 'per week' : 'per month'
    y = sectionTitle(doc, y, 'Revenue trend', 82)
    y = drawBarChart(doc, 14, y, 182, 62, data.buckets, {
      line: data.movingAverage,
      highlightMax: true,
      showValues: data.buckets.length <= 12,
    })
    let chartNote = `Bars show revenue ${modeText} (green = highest). `
    if (data.movingAverage) chartNote += 'Orange line = 7 day average, it shows the real direction without the daily ups and downs. '
    chartNote += `Overall trend: ${trendWord(data.trendPercent)}${data.trendPercent !== null ? ' (' + percentText(data.trendPercent) + ')' : ''}.`
    y = writeText(doc, y + 2, chartNote, 8, COLOR_GRAY, 14, 182) + 5

    // Quantity against money: the product with most units is not always the best one
    const compareRows = data.byRevenue.slice(0, 8)
    y = sectionTitle(doc, y + 2, 'Quantity vs money - who really earns?', compareRows.length * 11 + 30)
    y = writeText(doc, y, 'A product can sell many units at a small price, while another one with fewer units earns more because each unit costs more. Here the top earners are compared by their share of units and their share of money.', 8, COLOR_GRAY, 14, 182) + 3
    y = drawCompareBars(doc, 14, y, 182, compareRows.map(p => {
      const note = valueNote(p)
      return {
        label: p.name,
        unitShare: p.unitShare,
        moneyShare: p.share,
        line1: `${formatNumber(p.qty)} units at about ${formatMoney(p.avgPrice)} each`,
        line2: note,
        noteColor: note.startsWith('High') ? COLOR_GREEN : note.startsWith('Low') ? COLOR_ORANGE : COLOR_GRAY,
      }
    })) + 4

    // A short explanation of the top 5 earning products
    y = sectionTitle(doc, y, 'Top earning products explained', 40)
    data.byRevenue.slice(0, 5).forEach((p, i) => {
      let pattern = ''
      if (p.trend === 'Up') pattern = ` Demand is rising: ${formatNumber(p.firstHalfQty)} units in the first half, ${formatNumber(p.secondHalfQty)} in the second half.`
      else if (p.trend === 'Down') pattern = ` Demand is falling: ${formatNumber(p.firstHalfQty)} units in the first half, ${formatNumber(p.secondHalfQty)} in the second half.`
      else if (p.trend === 'New') pattern = ' It only started selling in the second half of the period.'
      else if (p.trend === 'Steady') pattern = ' Demand is steady through the period.'
      const text = `${i + 1}. ${p.name} (${p.category}): number ${p.revRank} for money and number ${p.qtyRank} for units. It sold ${formatNumber(p.qty)} units in ${p.orderCount} sale${p.orderCount > 1 ? 's' : ''} at about ${formatMoney(p.avgPrice)} per unit and earned ${formatMoney(p.revenue)} (${p.share.toFixed(0)}% of item revenue). ${valueNote(p)}.${pattern}`
      y = writeText(doc, y, text, 9, COLOR_DARK, 14, 182) + 1.5
    })
    y += 4

    // Full product table with a small trend line for each product
    y = sectionTitle(doc, y, 'All products sold (most units first)', 45)
    const shown = data.byQty.slice(0, 60)
    autoTable(doc, {
      startY: y,
      margin: { top: 18, bottom: 20, left: 14, right: 14 },
      head: [['#', 'Product', 'Category', 'Qty', 'Avg price (RWF)', 'Revenue (RWF)', 'Share', 'Class', 'Trend', 'Pattern']],
      body: shown.map((p, i) => [
        i + 1, p.name, p.category, formatNumber(p.qty), formatNumber(p.avgPrice),
        formatNumber(p.revenue), p.share.toFixed(1) + '%', p.abc, p.trend, '',
      ]),
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: COLOR_MAIN },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 6 }, 1: { cellWidth: 38 }, 2: { cellWidth: 22 },
        3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 26, halign: 'right' }, 6: { cellWidth: 12, halign: 'right' },
        7: { cellWidth: 11, halign: 'center' }, 8: { cellWidth: 13 }, 9: { cellWidth: 20 },
      },
      didParseCell: (cell) => {
        // numbers and their titles line up on the right
        if ([3, 4, 5, 6].includes(cell.column.index)) cell.cell.styles.halign = 'right'
        if (cell.column.index === 7) cell.cell.styles.halign = 'center'
        if (cell.section !== 'body') return
        if (cell.column.index === 8) {
          if (cell.cell.raw === 'Up' || cell.cell.raw === 'New') cell.cell.styles.textColor = COLOR_GREEN
          if (cell.cell.raw === 'Down') cell.cell.styles.textColor = COLOR_RED
        }
        if (cell.column.index === 7 && cell.cell.raw === 'A') cell.cell.styles.textColor = COLOR_GREEN
      },
      didDrawCell: (cell) => {
        if (cell.section === 'body' && cell.column.index === 9) {
          const p = shown[cell.row.index]
          if (p) drawSparkline(doc, cell.cell.x + 2, cell.cell.y + 2, cell.cell.width - 4, cell.cell.height - 4, p.spark)
        }
      },
    })
    y = doc.lastAutoTable.finalY + 4
    let tableNote = 'Avg price = money earned divided by units sold. Compare it with Qty: a product with fewer units but a higher price can earn more. '
    tableNote += 'Class A = the products that together make 80% of revenue (your key products), B = the next 15%, C = the rest. '
    tableNote += 'Trend compares the daily average of the first and second half of the period. Pattern = quantity sold across the period.'
    if (data.byQty.length > shown.length) tableNote += ` Showing the first ${shown.length} of ${data.byQty.length} products.`
    y = writeText(doc, y, tableNote, 7.5, COLOR_GRAY, 14, 182) + 5

    // Weekday chart
    y = sectionTitle(doc, y, 'Which weekday sells best', 75)
    y = drawBarChart(doc, 14, y, 182, 52, data.weekdayData, { highlightMax: true, showValues: true })
    y = writeText(doc, y + 2, 'Average revenue on each weekday during this period (green = strongest). Use it to plan stock and staff for your busiest days.', 8, COLOR_GRAY, 14, 182) + 5

    // Payment methods
    y = sectionTitle(doc, y, 'Payment methods', data.methods.length * 6.8 + 16)
    y = drawHorizontalBars(doc, 14, y, 182, data.methods.map(m => ({
      label: `${m.name} (${m.count} sale${m.count > 1 ? 's' : ''})`,
      value: m.value,
      text: `${formatMoney(m.value)} (${((m.value / data.revenue) * 100).toFixed(0)}%)`,
    })), COLOR_ORANGE)

    // Categories
    if (data.categories.length > 0) {
      y = sectionTitle(doc, y + 2, 'Revenue by category', Math.min(data.categories.length, 10) * 6.8 + 16)
      y = drawHorizontalBars(doc, 14, y, 182, data.categories.slice(0, 10).map(c => ({
        label: c.name,
        value: c.value,
        text: `${formatMoney(c.value)} (${data.itemsRevenue > 0 ? ((c.value / data.itemsRevenue) * 100).toFixed(0) : 0}%)`,
      })), COLOR_GREEN)
    }

    // Top customers
    y = sectionTitle(doc, y + 5, 'Top customers', 50)
    autoTable(doc, {
      startY: y,
      margin: { top: 18, bottom: 20, left: 14, right: 14 },
      head: [['#', 'Customer', 'Sales', 'Total (RWF)', 'Share']],
      body: data.customers.slice(0, 5).map((c, i) => [
        i + 1, c.name, c.count, formatNumber(c.value), ((c.value / data.revenue) * 100).toFixed(1) + '%',
      ]),
      styles: { fontSize: 8.5, cellPadding: 1.8 },
      headStyles: { fillColor: COLOR_MAIN },
      columnStyles: { 0: { cellWidth: 8 } },
      didParseCell: (cell) => {
        if ([2, 3, 4].includes(cell.column.index)) cell.cell.styles.halign = 'right'
      },
    })
    y = doc.lastAutoTable.finalY + 8

    // Products that did not sell
    if (data.unsold.length > 0) {
      y = sectionTitle(doc, y, 'Products that did not sell in this period', 35)
      const names = data.unsold.slice(0, 25).join(', ') + (data.unsold.length > 25 ? ` and ${data.unsold.length - 25} more` : '')
      y = writeText(doc, y, names, 8.5, COLOR_DARK, 14, 182) + 2
      y = writeText(doc, y, 'Check these: they may be overstocked, priced too high, or simply seasonal.', 8, COLOR_GRAY, 14, 182) + 4
    }

    // How the numbers are counted
    y = needSpace(doc, y, 18)
    y = writeText(doc, y, 'About these numbers: revenue counts the full value of every sale, including credit sales not yet paid. "Money collected" counts only what was received. The previous period used for comparison has the same number of days and ends the day before this period starts.', 7.5, COLOR_GRAY, 14, 182)
  }

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
      doc.text(`${companyName} - Sales Analysis ${formatDate(data.fromDate)} to ${formatDate(data.toDate)}`, 14, 10)
    }
    doc.setDrawColor(226, 232, 240)
    doc.line(14, 284, 196, 284)
    doc.text(companyName, 14, 289)
    doc.text(`Page ${i} of ${pageCount}`, 105, 289, { align: 'center' })
    doc.text('Powered by KaySales', 196, 289, { align: 'right' })
  }

  return doc
}
// ===== REPORT HELPERS END =====

export default function Analysis() {
  const { profile, can, planLabel, canView } = useAuth()
  const navigate = useNavigate()
  const showProfit = profile?.show_profit === true && canView('financials')
  // Advanced charts come with the Premium and Organization plans
  const hasAdvancedAnalytics = can('advancedAnalytics')
  const [saleItems, setSaleItems] = useState([])
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return localDate(d)
  })
  const [dateTo, setDateTo] = useState(localDate(new Date()))
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (profile?.id) fetchData()
  }, [profile])

  useEffect(() => {
    const handleFocus = () => {
      if (profile?.id) fetchData(false)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [profile])

  const fetchData = async (showLoader = true) => {
    if (showLoader) setLoading(true)

    const [
      { data: salesData },
      { data: itemsData },
      { data: productsData }
    ] = await Promise.all([
      fetchAllRows(() => supabase.from('sales').select('*').eq('user_id', profile.id).order('created_at', { ascending: true })),
      fetchAllRows(() => supabase.from('sale_items').select('*').eq('user_id', profile.id)),
      fetchAllRows(() => supabase.from('products').select('id, name, category').eq('user_id', profile.id)),
    ])

    setSales(salesData || [])
    setSaleItems(itemsData || [])
    setProducts(productsData || [])
    setLoading(false)
  }

  // Filter sales by date
  const filteredSales = sales.filter(s => isInRange(s.created_at, dateFrom, dateTo))

  const filteredSaleIds = filteredSales.map(s => s.id)
  const filteredItems = saleItems.filter(i => filteredSaleIds.includes(i.sale_id))

  // 1. Revenue Over Time (by day)
  const revenueByDay = filteredSales.reduce((acc, sale) => {
    const date = new Date(sale.created_at).toLocaleDateString()
    acc[date] = (acc[date] || 0) + (sale.total || 0)
    return acc
  }, {})
  const revenueChartData = Object.entries(revenueByDay).map(([date, total]) => ({ date, total }))

  // 2. Units sold per product (used by the Quantity vs Money chart below)
  const productQty = filteredItems.reduce((acc, item) => {
    acc[item.product_name] = (acc[item.product_name] || 0) + (item.quantity_sold || 0)
    return acc
  }, {})

  // 3. Revenue by Product
  const productRevenue = filteredItems.reduce((acc, item) => {
    acc[item.product_name] = (acc[item.product_name] || 0) + (item.total || 0)
    return acc
  }, {})
  const revenueByProductData = Object.entries(productRevenue)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  // Quantity vs Money: share of the units sold against share of the money earned,
  // for the products that earned the most. A product with fewer units can earn
  // more because each unit costs more.
  const totalUnitsShown = filteredItems.reduce((sum, i) => sum + (i.quantity_sold || 0), 0)
  const totalMoneyShown = filteredItems.reduce((sum, i) => sum + (i.total || 0), 0)
  const compareData = Object.entries(productRevenue)
    .map(([name, money]) => {
      const qty = productQty[name] || 0
      return {
        name,
        qty,
        money,
        avgPrice: qty > 0 ? Math.round(money / qty) : 0,
        unitsShare: totalUnitsShown > 0 ? Math.round((qty / totalUnitsShown) * 1000) / 10 : 0,
        moneyShare: totalMoneyShown > 0 ? Math.round((money / totalMoneyShown) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => b.money - a.money)
    .slice(0, 8)

  // 4. Daily Sales Count
  const salesPerDay = filteredSales.reduce((acc, sale) => {
    const date = new Date(sale.created_at).toLocaleDateString()
    acc[date] = (acc[date] || 0) + 1
    return acc
  }, {})
  const dailySalesData = Object.entries(salesPerDay).map(([date, count]) => ({ date, count }))

  // 5. Payment Method Breakdown
  const paymentBreakdown = filteredSales.reduce((acc, sale) => {
    const method = sale.payment_method || 'cash'
    acc[method] = (acc[method] || 0) + (sale.total || 0)
    return acc
  }, {})
  const paymentMethodData = Object.entries(paymentBreakdown).map(([method, value]) => ({
    name: method === 'mtn' ? 'MTN' :
          method === 'bank' ? 'Bank' :
          method === 'cheque' ? 'Cheque' :
          method === 'credit' ? 'Credit' : 'Cash',
    value
  }))

  // 6. Revenue by Category (using products table)
  const productCategoryMap = products.reduce((acc, p) => {
    acc[p.name] = p.category || 'Uncategorized'
    return acc
  }, {})
  const categoryRevenue = filteredItems.reduce((acc, item) => {
    const category = productCategoryMap[item.product_name] || 'Uncategorized'
    acc[category] = (acc[category] || 0) + (item.total || 0)
    return acc
  }, {})
  const categoryData = Object.entries(categoryRevenue)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // PREMIUM — Best Selling Day of Week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const revenueByDayOfWeek = filteredSales.reduce((acc, sale) => {
    const day = dayNames[new Date(sale.created_at).getDay()]
    acc[day] = (acc[day] || 0) + (sale.total || 0)
    return acc
  }, {})
  const dayOfWeekData = dayNames.map(day => ({ day: day.slice(0, 3), total: revenueByDayOfWeek[day] || 0 }))

  // PREMIUM — Monthly Revenue Trend
  const revenueByMonth = filteredSales.reduce((acc, sale) => {
    const month = new Date(sale.created_at).toLocaleDateString('en-RW', { month: 'short', year: 'numeric' })
    acc[month] = (acc[month] || 0) + (sale.total || 0)
    return acc
  }, {})
  const monthlyData = Object.entries(revenueByMonth).map(([month, total]) => ({ month, total }))

  // Profit over time (show_profit users only)
  const profitByDay = filteredSales.reduce((acc, sale) => {
    if (sale.profit == null) return acc
    const date = new Date(sale.created_at).toLocaleDateString()
    acc[date] = (acc[date] || 0) + (sale.profit || 0)
    return acc
  }, {})
  const profitChartData = Object.entries(profitByDay).map(([date, profit]) => ({ date, profit }))

  const COLORS = ['#818cf8', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

  const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0)
  const totalProfit = filteredSales.reduce((sum, s) => sum + (s.profit || 0), 0)
  const totalItemsSold = filteredItems.reduce((sum, i) => sum + (i.quantity_sold || 0), 0)
  const totalSalesCount = filteredSales.length
  const avgSaleValue = totalSalesCount > 0 ? Math.round(totalRevenue / totalSalesCount) : 0

  // Opens the report window with the dates already chosen on the page
  const openExport = () => {
    const now = new Date()
    setExportFrom(dateFrom || localDate(new Date(now.getFullYear(), now.getMonth(), 1)))
    setExportTo(dateTo || localDate(now))
    setExportError('')
    setShowExportModal(true)
  }

  // Quick choices inside the report window
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
      const doc = await makeAnalysisPdf(profile, sales, saleItems, products, exportFrom, lastDay, showProfit)
      doc.save(`KaySales_Analysis_${exportFrom}_to_${lastDay}.pdf`)
      setShowExportModal(false)
    } catch (err) {
      console.error('Could not create the analysis PDF:', err)
      setExportError('Could not create the PDF. Please try again.')
    }
    setExporting(false)
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-gray-400">Loading analysis...</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-4 sm:p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Analysis</h1>
            <p className="text-gray-400 text-sm mt-1">
              Visual insights from your sales data
              {hasAdvancedAnalytics && <span className="ml-2 text-xs bg-primary text-white px-2 py-0.5 rounded-full">{planLabel}</span>}
            </p>
          </div>
          <button
            onClick={openExport}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition font-medium"
          >
            Export PDF
          </button>
        </div>

        {/* Date Filter */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-surface-elevated border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary flex-1 min-w-[130px]"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-surface-elevated border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary flex-1 min-w-[130px]"
          />
          <button
            onClick={() => {
              const d = new Date()
              d.setDate(d.getDate() - 30)
              setDateFrom(localDate(d))
              setDateTo(localDate(new Date()))
            }}
            className="px-3 py-2 bg-surface-elevated border border-surface-border text-gray-400 hover:text-white rounded-lg text-sm transition whitespace-nowrap"
          >
            Last 30 Days
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Revenue', value: `RWF ${totalRevenue.toLocaleString()}`, color: 'text-green-400' },
            { label: 'Total Sales', value: totalSalesCount, color: 'text-white' },
            { label: 'Items Sold', value: totalItemsSold, color: 'text-white' },
            { label: 'Avg Sale Value', value: `RWF ${avgSaleValue.toLocaleString()}`, color: 'text-primary-light' },
          ].map((stat, i) => (
            <div key={i} className="bg-surface-elevated border border-surface-border rounded-xl p-4">
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-gray-400 text-xs mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Profit stat for show_profit users */}
        {showProfit && (
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Profit (selected period)</p>
              <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-primary-light' : 'text-red-400'}`}>
                RWF {totalProfit.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Chart 1 — Revenue Over Time */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-bold text-white mb-4">Revenue Over Time</h2>
          {revenueChartData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232733" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={70} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#161922', border: '1px solid #232733', borderRadius: '8px' }}
                  formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                />
                <Line type="monotone" dataKey="total" stroke="#818cf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 2 — Quantity vs Money */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-bold text-white mb-1">Quantity vs Money</h2>
          <p className="text-gray-400 text-xs mb-4">Share of units sold against share of money earned. A product with fewer units can earn more because each unit costs more.</p>
          {compareData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={compareData.length * 44 + 40}>
              <BarChart data={compareData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#232733" />
                <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 9 }} width={90} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null
                    const p = payload[0].payload
                    return (
                      <div style={{ backgroundColor: '#161922', border: '1px solid #232733', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
                        <p style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>{p.name}</p>
                        <p style={{ color: '#9ca3af' }}>{p.qty.toLocaleString()} units at about RWF {p.avgPrice.toLocaleString()} each</p>
                        <p style={{ color: '#9ca3af' }}>{p.unitsShare}% of units sold</p>
                        <p style={{ color: '#10b981' }}>RWF {p.money.toLocaleString()} ({p.moneyShare}% of money)</p>
                      </div>
                    )
                  }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="unitsShare" name="Share of units sold" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                <Bar dataKey="moneyShare" name="Share of money earned" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 3 & 4 — Revenue by Product + Payment Methods */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Revenue by Product */}
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-6">
            <h2 className="text-lg font-bold text-white mb-4">Revenue by Product</h2>
            {revenueByProductData.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={revenueByProductData}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {revenueByProductData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#161922', border: '1px solid #232733', borderRadius: '8px' }}
                    formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Payment Method Breakdown */}
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-6">
            <h2 className="text-lg font-bold text-white mb-4">Payment Methods</h2>
            {paymentMethodData.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#161922', border: '1px solid #232733', borderRadius: '8px' }}
                    formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Revenue by Category */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-bold text-white mb-4">Revenue by Category</h2>
          {categoryData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#232733" />
                <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 9 }} width={90} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#161922', border: '1px solid #232733', borderRadius: '8px' }}
                  formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                />
                <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Profit Over Time — show_profit users only */}
        {showProfit && profitChartData.length > 0 && (
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-6">
            <h2 className="text-lg font-bold text-white mb-1">Profit Over Time</h2>
            <p className="text-gray-400 text-xs mb-4">Daily profit trend</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={profitChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232733" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={70} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#161922', border: '1px solid #232733', borderRadius: '8px' }}
                  formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Profit']}
                />
                <Line type="monotone" dataKey="profit" stroke="#a855f7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Daily Sales Count */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-bold text-white mb-4">Daily Sales Count</h2>
          {dailySalesData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232733" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={30} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#161922', border: '1px solid #232733', borderRadius: '8px' }}
                  formatter={(value) => [value, 'Sales']}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* PREMIUM CHARTS */}
        {hasAdvancedAnalytics ? (
          <>
            <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-6">
              <h2 className="text-lg font-bold text-white mb-1">
                Best Selling Day of Week
                <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full ml-2">Premium</span>
              </h2>
              <p className="text-gray-400 text-xs mb-4">Which day of the week brings most revenue</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dayOfWeekData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232733" />
                  <XAxis dataKey="day" stroke="#9ca3af" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={70} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#161922', border: '1px solid #232733', borderRadius: '8px' }}
                    formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-6">
              <h2 className="text-lg font-bold text-white mb-1">
                Monthly Revenue Trend
                <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full ml-2">Premium</span>
              </h2>
              <p className="text-gray-400 text-xs mb-4">Month by month revenue comparison</p>
              {monthlyData.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232733" />
                    <XAxis dataKey="month" stroke="#9ca3af" tick={{ fontSize: 9 }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} width={70} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#161922', border: '1px solid #232733', borderRadius: '8px' }}
                      formatter={(value) => [`RWF ${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Line type="monotone" dataKey="total" stroke="#ec4899" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        ) : (
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-6 text-center">
            <h3 className="text-white font-bold text-lg">Unlock Premium Charts</h3>
            <p className="text-gray-400 text-sm mt-2">Upgrade to Premium to access Day of Week analysis and Monthly Revenue Trend charts.</p>
            <p className="text-gray-500 text-xs mt-2">Contact admin to upgrade your plan.</p>
            <button
              onClick={() => navigate('/choose-plan')}
              className="mt-4 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition"
            >
              View Plans
            </button>
          </div>
        )}

      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <h2 className="text-lg font-bold text-white">Export PDF Report</h2>
              <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-gray-400 text-sm">Choose the month or period you want. The report explains every product sold, the charts and the trend.</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => pickExportRange('thisMonth')} className="px-3 py-1 bg-surface border border-surface-border text-gray-300 hover:text-white rounded-lg text-xs transition">This month</button>
                <button onClick={() => pickExportRange('lastMonth')} className="px-3 py-1 bg-surface border border-surface-border text-gray-300 hover:text-white rounded-lg text-xs transition">Last month</button>
                <button onClick={() => pickExportRange('last30')} className="px-3 py-1 bg-surface border border-surface-border text-gray-300 hover:text-white rounded-lg text-xs transition">Last 30 days</button>
                <button onClick={() => pickExportRange('thisYear')} className="px-3 py-1 bg-surface border border-surface-border text-gray-300 hover:text-white rounded-lg text-xs transition">This year</button>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">From Date</label>
                <input type="date" value={exportFrom} max={localDate(new Date())} onChange={(e) => setExportFrom(e.target.value)} className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">To Date</label>
                <input type="date" value={exportTo} max={localDate(new Date())} onChange={(e) => setExportTo(e.target.value)} className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary" />
              </div>
              {exportError && <p className="text-red-400 text-sm">{exportError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowExportModal(false)} className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition">Cancel</button>
                <button onClick={handleExport} disabled={exporting} className="flex-1 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white rounded-lg transition font-medium">{exporting ? 'Preparing...' : 'Download'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}