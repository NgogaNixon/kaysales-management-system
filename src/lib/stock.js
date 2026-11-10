import { supabase } from './supabase'

// True when the database function is not installed yet
function functionMissing(error) {
  return Boolean(error) && (error.code === 'PGRST202' || /could not find the function/i.test(error.message || ''))
}

// Adds stock to a product (a plus number) or removes it (a minus number)
// in one safe step, so two people selling at the same time cannot overwrite each other.
// It returns an error message, or an empty text when everything worked.
export async function changeStock(productId, change) {
  const { error } = await supabase.rpc('adjust_product_stock', {
    p_product_id: productId,
    p_change: change,
  })
  if (!error) return ''

  // Any real error (no permission, a stock rule, etc.) must NOT be bypassed.
  if (!functionMissing(error)) return error.message || 'Stock could not be updated'

  // Only if the database function is not installed at all, use the old way so nothing breaks
  const { data: fresh } = await supabase
    .from('products')
    .select('quantity')
    .eq('id', productId)
    .single()
  if (!fresh) return 'Product not found'

  const { error: updateError } = await supabase
    .from('products')
    .update({ quantity: fresh.quantity + change })
    .eq('id', productId)
  return updateError ? updateError.message : ''
}
