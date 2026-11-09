import { supabase } from '../lib/supabase'

// Shown to a person whose account was closed (moved to Trash) by the admin
export default function AccountClosed() {
  const logout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="bg-surface-elevated border border-red-800 rounded-2xl p-8 w-full max-w-md text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Account closed</h2>
        <p className="text-gray-400 mb-6">
          This account was closed, so it cannot be used. Please contact the KaySales admin if you think this is a mistake.
        </p>
        <button
          onClick={logout}
          className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
        >
          Logout
        </button>
      </div>
    </div>
  )
}
