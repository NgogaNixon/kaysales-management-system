import { supabase } from './supabase'

// Company staff sign up like any client, but they are not clients: they work
// inside a company and do not pay. Admin pages leave them out of the client
// lists, counts and reports. Returns a Set of their user ids.
export async function fetchStaffUserIds() {
  const { data } = await supabase.from('organization_members').select('user_id')
  return new Set((data || []).map((m) => m.user_id))
}