import { supabase } from './supabase'
import { getDeviceId, getAutoDeviceLabel } from './deviceId'

// IP is background context only, never the primary proof (see getIpAddress
// below for why). Cached per page load so we don't hit the lookup service on
// every single action.
let cachedIp = null

const getIpAddress = async () => {
  if (cachedIp) return cachedIp
  try {
    const response = await fetch('https://api.ipify.org?format=json')
    const data = await response.json()
    cachedIp = data.ip
    return cachedIp
  } catch (error) {
    // Never let an IP lookup failure block the actual action from being logged.
    return null
  }
}

export const logActivity = async (userId, userEmail, userName, action, details) => {
  try {
    const device = navigator.userAgent
    const browser = getBrowser()
    const deviceId = getDeviceId()
    const ipAddress = await getIpAddress()

    await supabase.from('activity_logs').insert({
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      action,
      details,
      device,
      browser,
      device_id: deviceId,
      ip_address: ipAddress,
    })

    // Keep the devices table in sync: register on first use, update last_seen on
    // every action after that. Never overwrites a label someone has already set.
    const { data: existing } = await supabase
      .from('devices')
      .select('id')
      .eq('device_id', deviceId)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('devices')
        .update({ last_seen: new Date().toISOString() })
        .eq('device_id', deviceId)
    } else {
      await supabase.from('devices').insert({
        device_id: deviceId,
        label: getAutoDeviceLabel(deviceId),
        account_user_id: userId,
      })
    }
  } catch (error) {
    console.error('Failed to log activity:', error)
  }
}

const getBrowser = () => {
  const ua = navigator.userAgent
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  if (ua.includes('Edge')) return 'Edge'
  return 'Unknown'
}
