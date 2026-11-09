import { supabase } from './supabase'
import { localDate } from './dates'

// Default expiry date for an approval: 7 days for a free trial, 30 days for a paid plan
export function getDefaultExpiry(payment) {
  const isTrial = payment.transaction_id === 'FREE-TRIAL'
  const d = new Date()
  d.setDate(d.getDate() + (isTrial ? 7 : 30))
  return localDate(d)
}

// True when the database function is not installed yet
function functionMissing(error) {
  return Boolean(error) && (error.code === 'PGRST202' || /could not find the function/i.test(error.message || ''))
}

// Makes sure a client has a company (created once).
// It returns an error message, or an empty text when everything worked.
export async function ensureCompany(userId, companyName) {
  const { error } = await supabase.rpc('admin_ensure_company', {
    p_user: userId,
    p_name: companyName || '',
  })
  if (!error) return ''
  if (!functionMissing(error)) return 'The company could not be created: ' + error.message

  // The database function is missing: use the old way so nothing breaks
  return await ensureCompanyOldWay(userId, companyName)
}

// Approves one payment request. Everything happens in one safe step in the database:
// the request, the client, the subscription and (for Organization) the company.
// chosenDate is the expiry date like '2026-12-02'.
// It returns an error message, or an empty text when everything worked.
export async function approvePaymentRequest(payment, chosenDate, companyName) {
  const { error } = await supabase.rpc('admin_approve_payment', {
    p_payment_id: String(payment.id),
    p_expiry: chosenDate,
    p_company_name: companyName || '',
  })
  if (!error) return ''
  if (!functionMissing(error)) return error.message

  // The database function is missing: use the old way so nothing breaks
  return await approvePaymentOldWay(payment, chosenDate, companyName)
}

// ---------- the old way (only used when the database functions are not installed) ----------

async function ensureCompanyOldWay(userId, companyName) {
  const { data: existingCompany } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle()

  if (existingCompany) return ''

  const { error } = await supabase
    .from('organizations')
    .insert({ owner_id: userId, name: companyName })
  if (error) {
    return 'The company could not be created: ' + error.message
  }

  await supabase.from('profiles').update({ show_profit: true }).eq('id', userId)
  return ''
}

async function approvePaymentOldWay(payment, chosenDate, companyName) {
  let message = ''

  await supabase
    .from('payment_requests')
    .update({ status: 'approved' })
    .eq('id', payment.id)

  await supabase
    .from('profiles')
    .update({ approved: true, plan_type: payment.plan_type })
    .eq('id', payment.user_id)

  const expiryIso = new Date(chosenDate + 'T23:59:59').toISOString()
  const isTrialRequest = payment.transaction_id === 'FREE-TRIAL'

  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', payment.user_id)
    .single()

  const subResult = existingSub
    ? await supabase
        .from('subscriptions')
        .update({
          plan_type: payment.plan_type,
          payment_status: 'paid',
          expiry_date: expiryIso,
          is_trial: isTrialRequest,
        })
        .eq('user_id', payment.user_id)
    : await supabase
        .from('subscriptions')
        .insert({
          user_id: payment.user_id,
          plan_type: payment.plan_type,
          payment_status: 'paid',
          expiry_date: expiryIso,
          is_trial: isTrialRequest,
        })
  if (subResult.error) {
    message = 'Payment approved, but the subscription could not be saved: ' + subResult.error.message
  }

  if (payment.plan_type === 'organization') {
    const companyMessage = await ensureCompanyOldWay(payment.user_id, companyName)
    if (companyMessage) {
      message = message + ' ' + companyMessage
    }
  }

  return message.trim()
}
