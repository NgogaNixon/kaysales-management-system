import { supabase } from './supabase'
import { getDeviceId, getAutoDeviceLabel } from './deviceId'
import { ROLE_LABELS } from './permissions'

// IP is background context only, never the primary proof (see getIpAddress
// below for why). Cached per page load so we don't hit the lookup service on
// every single action.
let cachedIp = null
let ipLookupDone = false

const getIpAddress = async () => {
  if (ipLookupDone) return cachedIp
  ipLookupDone = true // a slow or failed lookup is not repeated on every action
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal })
    const data = await response.json()
    cachedIp = data.ip || null
    return cachedIp
  } catch {
    // Never let an IP lookup failure (or a slow one) block the actual action from being logged.
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Company staff work as the company owner, so pages pass the OWNER's id, email
// and name here. The log must name the person who really did the action, so
// when the logged-in person is not the one passed in, their own details (and
// role) are used instead. Looked up once and remembered.
let cachedActor = null

const resolveActor = async (userId, userEmail, userName) => {
  const { data: { session } } = await supabase.auth.getSession()
  const actorId = session?.user?.id
  if (!actorId || actorId === userId) return { id: userId, email: userEmail, name: userName }
  if (cachedActor && cachedActor.id === actorId) return cachedActor

  const [{ data: me }, { data: member }] = await Promise.all([
    supabase.from('profiles').select('full_name, email').eq('id', actorId).maybeSingle(),
    supabase.from('organization_members').select('role, role_label').eq('user_id', actorId).maybeSingle(),
  ])
  const role = member?.role ? ` (${member.role_label || ROLE_LABELS[member.role]})` : ''
  cachedActor = {
    id: actorId,
    email: me?.email || session.user.email,
    name: `${me?.full_name || session.user.email}${role}`,
  }
  return cachedActor
}

// Keep the devices table in sync: register on first use, update last_seen after
// that (at most once a minute per device). Never overwrites a label someone has set.
const DEVICE_SYNC_INTERVAL_MS = 60 * 1000
const lastDeviceSync = {}

const syncDevice = async (deviceId, userId) => {
  const now = Date.now()
  if (lastDeviceSync[deviceId] && now - lastDeviceSync[deviceId] < DEVICE_SYNC_INTERVAL_MS) return
  lastDeviceSync[deviceId] = now

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
}

export const logActivity = async (userId, userEmail, userName, action, details) => {
  try {
    const actor = await resolveActor(userId, userEmail, userName)
    userId = actor.id
    userEmail = actor.email
    userName = actor.name

    const device = navigator.userAgent
    const browser = getBrowser()
    const deviceId = getDeviceId()
    const ipAddress = await getIpAddress()

    // The log entry and the device update do not depend on each other, so run them together
    await Promise.all([
      supabase.from('activity_logs').insert({
        user_id: userId,
        user_email: userEmail,
        user_name: userName,
        action,
        details,
        device,
        browser,
        device_id: deviceId,
        ip_address: ipAddress,
      }),
      syncDevice(deviceId, userId),
    ])
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
