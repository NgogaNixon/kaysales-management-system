// Supabase returns at most 1000 rows per request. This loads ALL the rows,
// 1000 at a time, so totals and lists stay correct when a business grows.
//
// buildQuery must return a fresh query, for example:
//   fetchAllRows(() => supabase.from('sales').select('*').eq('user_id', id))
// It returns the same shape as a normal Supabase call: { data, error }.
const PAGE_SIZE = 1000
const MAX_PAGES = 200

export async function fetchAllRows(buildQuery) {
  const all = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await buildQuery()
      .order('id', { ascending: true }) // tie-breaker so pages never overlap
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    all.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return { data: all, error: null }
}
