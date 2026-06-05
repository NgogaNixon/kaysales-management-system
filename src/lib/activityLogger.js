import { supabase } from './supabase'

export const logActivity = async (userId, userEmail, userName, action, details) => {
  try {
    const device = navigator.userAgent
    const browser = getBrowser()

    await supabase.from('activity_logs').insert({
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      action,
      details,
      device,
      browser,
    })
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