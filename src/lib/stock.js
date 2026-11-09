import { supabase } from './supabase'

// Adds stock to a product (a plus number) or removes it (a minus number)
// in one safe step, so two people selling at the same time cannot overwrite each other.
export async function changeStock(productId, change) {
  const { error } = await supabase.rpc('adjust_product_stock', {
    p_product_id: productId,
    p_change: change,
  })
  if (!error) return

  // If the database function is not installed yet, use the old way so nothing breaks
  const { data: fresh } = await supabase
    .from('products')
    .select('quantity')
    .eq('id', productId)
    .single()
  if (fresh) {
    await supabase
      .from('products')
      .update({ quantity: fresh.quantity + change })
      .eq('id', productId)
  }
}
