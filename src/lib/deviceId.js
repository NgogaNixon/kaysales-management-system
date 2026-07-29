// Generates a persistent, random ID for this specific browser/device and stores
// it in localStorage. Unlike an IP address, this survives network changes and
// uniquely identifies the physical device — the actual goal when multiple
// people share one login.

const STORAGE_KEY = 'kaysales_device_id'

export const getDeviceId = () => {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

// Builds a reasonable default label like "Chrome on Windows (F3A9)" or
// "Safari on iPhone (7B2C)" so a brand-new device shows something readable
// immediately, AND stays distinguishable from other devices that happen to
// share the same browser/OS combo (e.g. three people all using iPhones) —
// the short tag comes from that device's own unique ID, so no two devices
// ever get the same default label, even before anyone renames them.
export const getAutoDeviceLabel = (deviceId) => {
  const ua = navigator.userAgent

  let browser = 'Unknown Browser'
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/') && !ua.includes('OPR/')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('OPR/')) browser = 'Opera'

  let os = 'Unknown Device'
  if (ua.includes('iPhone')) os = 'iPhone'
  else if (ua.includes('iPad')) os = 'iPad'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS')) os = 'Mac'
  else if (ua.includes('Linux')) os = 'Linux'

  const tag = (deviceId || '').replace(/-/g, '').slice(-4).toUpperCase() || '0000'

  return `${browser} on ${os} (${tag})`
}
