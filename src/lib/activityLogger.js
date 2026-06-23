import { supabase } from './supabase'

export const logActivity = async (userId, userEmail, userName, action, details) => {
  try {
    const device = navigator.userAgent
    const browser = getBrowser()
    const deviceType = getDeviceType()
    const os = getOS()
    let ipAddress = 'Unknown'

    try {
      const res = await fetch('https://api.ipify.org?format=json')
      const data = await res.json()
      ipAddress = data.ip
    } catch {
      ipAddress = 'Unknown'
    }

    await supabase.from('activity_logs').insert({
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      action,
      details,
      device,
      browser,
      device_type: deviceType,
      os,
      ip_address: ipAddress,
    })
  } catch (error) {
    console.error('Failed to log activity:', error)
  }
}

const getBrowser = () => {
  const ua = navigator.userAgent
  if (ua.includes('Edg')) return 'Edge'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera'
  return 'Unknown'
}

const getDeviceType = () => {
  const ua = navigator.userAgent
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'Tablet'
  if (/mobile|iphone|ipod|android|blackberry|mini|windows\sce|palm/i.test(ua)) return 'Mobile'
  return 'Desktop'
}

const getOS = () => {
  const ua = navigator.userAgent
  if (ua.includes('Windows NT 10')) return 'Windows 10/11'
  if (ua.includes('Windows NT 6.3')) return 'Windows 8.1'
  if (ua.includes('Windows NT 6.1')) return 'Windows 7'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Mac OS X')) return 'macOS'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  if (ua.includes('Linux')) return 'Linux'
  return 'Unknown'
}