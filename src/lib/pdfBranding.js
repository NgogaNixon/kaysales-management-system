// Shared helper so every PDF (Sales receipt, Dashboard receipt, Quotation,
// Credit statement) applies the same company branding consistently, instead
// of duplicating image-loading and layout logic in four different files.

// Converts an image URL into a base64 data URI, since jsPDF's addImage()
// needs actual image data, not a URL. Never throws — returns null on any
// failure so a broken/missing image never blocks the PDF from generating.
export async function urlToDataUri(url) {
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    console.error('Failed to load branding image for PDF:', err)
    return null
  }
}

const formatFromDataUri = (dataUri) => {
  if (dataUri?.startsWith('data:image/png')) return 'PNG'
  if (dataUri?.startsWith('data:image/jpeg') || dataUri?.startsWith('data:image/jpg')) return 'JPEG'
  return 'PNG'
}

// Draws the branded header (logo, company name, phone/location/TIN) at the
// top of a jsPDF document. Falls back gracefully to plain "KaySales" text
// for any account that hasn't set up its branding yet.
// Returns the Y position where content can safely start below the header.
export async function drawBrandedHeader(doc, profile, startX = 14) {
  let y = 15

  const logoDataUri = await urlToDataUri(profile?.logo_url)
  if (logoDataUri) {
    try {
      doc.addImage(logoDataUri, formatFromDataUri(logoDataUri), startX, y, 22, 22)
    } catch (err) {
      console.error('Failed to draw logo:', err)
    }
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(profile?.company_name || 'KaySales Management System', startX + 26, y + 9)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(9)
    let subY = y + 15
    if (profile?.company_location) {
      doc.text(profile.company_location, startX + 26, subY)
      subY += 4
    }
    const contactLine = [profile?.company_phone, profile?.company_tin ? `TIN: ${profile.company_tin}` : null]
      .filter(Boolean)
      .join('  ·  ')
    if (contactLine) {
      doc.text(contactLine, startX + 26, subY)
    }
    y += 30
  } else {
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text(profile?.company_name || 'KaySales Management System', startX, y)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(9)
    let subY = y + 6
    if (profile?.company_location) {
      doc.text(profile.company_location, startX, subY)
      subY += 4
    }
    const contactLine = [profile?.company_phone, profile?.company_tin ? `TIN: ${profile.company_tin}` : null]
      .filter(Boolean)
      .join('  ·  ')
    if (contactLine) {
      doc.text(contactLine, startX, subY)
    }
    y += 18
  }

  return y
}

// Draws signature (left) + stamp (right) near the bottom of the page.
// Skips gracefully if either or both haven't been uploaded.
export async function drawSignatureAndStamp(doc, profile, pageWidth = 210, bottomY = 280) {
  const signatureDataUri = await urlToDataUri(profile?.signature_url)
  const stampDataUri = await urlToDataUri(profile?.stamp_url)

  if (!signatureDataUri && !stampDataUri) return

  const boxY = bottomY - 22

  if (signatureDataUri) {
    try {
      doc.addImage(signatureDataUri, formatFromDataUri(signatureDataUri), 14, boxY, 35, 18)
    } catch (err) {
      console.error('Failed to draw signature:', err)
    }
    doc.setFontSize(8)
    doc.text('Authorized Signature', 14, bottomY + 2)
  }

  if (stampDataUri) {
    const stampX = pageWidth - 14 - 35
    try {
      doc.addImage(stampDataUri, formatFromDataUri(stampDataUri), stampX, boxY, 35, 18)
    } catch (err) {
      console.error('Failed to draw stamp:', err)
    }
    doc.setFontSize(8)
    doc.text('Company Stamp', stampX, bottomY + 2)
  }
}

// ============================================================
// Narrow-format variants for the 80mm thermal receipt used by
// Sales.jsx and Dashboard.jsx (the standard A4 functions above
// are for Quotations.jsx and Credits.jsx, which use full-width pages)
// ============================================================

// Draws a compact, centered header for an 80mm-wide receipt.
// Returns the Y position where the rest of the receipt content should start.
export async function drawBrandedHeaderNarrow(doc, profile) {
  const centerX = 40 // half of 80mm page width
  let y = 8

  const logoDataUri = await urlToDataUri(profile?.logo_url)
  if (logoDataUri) {
    try {
      doc.addImage(logoDataUri, formatFromDataUri(logoDataUri), centerX - 8, y, 16, 16)
    } catch (err) {
      console.error('Failed to draw logo:', err)
    }
    y += 19
  }

  doc.setFontSize(12)
  doc.setFont(undefined, 'bold')
  doc.text(profile?.company_name || 'KaySales Management System', centerX, y, { align: 'center' })
  doc.setFont(undefined, 'normal')
  y += 5

  doc.setFontSize(7.5)
  if (profile?.company_location) {
    doc.text(profile.company_location, centerX, y, { align: 'center' })
    y += 4
  }
  const contactLine = [profile?.company_phone, profile?.company_tin ? `TIN: ${profile.company_tin}` : null]
    .filter(Boolean)
    .join(' · ')
  if (contactLine) {
    doc.text(contactLine, centerX, y, { align: 'center' })
    y += 4
  }

  doc.setFontSize(9)
  return y + 2
}

// Draws signature (left) + stamp (right) sized for an 80mm-wide receipt.
// Skips gracefully if either or both haven't been uploaded.
// Returns the Y position where the footer text (Thank you / Powered by) should start.
export async function drawSignatureAndStampNarrow(doc, profile, startY) {
  const signatureDataUri = await urlToDataUri(profile?.signature_url)
  const stampDataUri = await urlToDataUri(profile?.stamp_url)

  if (!signatureDataUri && !stampDataUri) return startY

  const boxY = startY + 2

  if (signatureDataUri) {
    try {
      doc.addImage(signatureDataUri, formatFromDataUri(signatureDataUri), 5, boxY, 28, 14)
    } catch (err) {
      console.error('Failed to draw signature:', err)
    }
    doc.setFontSize(6.5)
    doc.text('Signature', 5, boxY + 17)
  }

  if (stampDataUri) {
    const stampX = 80 - 5 - 28
    try {
      doc.addImage(stampDataUri, formatFromDataUri(stampDataUri), stampX, boxY, 28, 14)
    } catch (err) {
      console.error('Failed to draw stamp:', err)
    }
    doc.setFontSize(6.5)
    doc.text('Company Stamp', stampX, boxY + 17)
  }

  doc.setFontSize(9)
  return boxY + 20
}

// Computes the exact page height needed for a narrow 80mm receipt so nothing
// ever gets cut off, no matter how many items are on it. Used instead of a
// fixed page height, which would silently truncate long receipts.
export function estimateNarrowReceiptHeight(profile, itemCount) {
  const headerHeight = profile?.logo_url ? 42 : 24
  const infoBlockHeight = 26 // date/customer/payment lines + separators
  const itemsHeight = itemCount * 16
  const footerBlockHeight = (profile?.signature_url || profile?.stamp_url) ? 55 : 30
  const margin = 15
  return Math.max(140, headerHeight + infoBlockHeight + itemsHeight + footerBlockHeight + margin)
}
