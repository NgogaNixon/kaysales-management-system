import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Lets a person delete their own account for good.
// doneMessage: text shown after the account is deleted.
// goTo: the page to open afterwards (for example '/signup').
export default function DeleteMyAccount({ warning, doneMessage, goTo, onCancel }) {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setError('')
    if (email.trim().toLowerCase() !== (user?.email || '').toLowerCase()) {
      setError('Type your account email exactly to confirm.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }

    setBusy(true)

    // Check the password first
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    })
    if (loginError) {
      setError('The password is not correct.')
      setBusy(false)
      return
    }

    const { error: deleteError } = await supabase.rpc('delete_my_account')
    if (deleteError) {
      setError(deleteError.message)
      setBusy(false)
      return
    }

    await supabase.auth.signOut()
    alert(doneMessage)
    window.location.href = goTo
  }

  return (
    <div className="bg-red-950 border border-red-800 rounded-xl p-4 space-y-3 text-left">
      <p className="text-red-200 text-sm font-bold">Delete my account</p>
      <p className="text-red-300 text-xs">{warning}</p>

      {error && <p className="text-red-300 text-xs bg-red-900 border border-red-700 rounded-lg p-2">{error}</p>}

      <div>
        <label className="text-gray-400 text-xs block mb-1">Type your email ({user?.email}) to confirm</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-red-500"
        />
      </div>
      <div>
        <label className="text-gray-400 text-xs block mb-1">Your password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-red-500"
        />
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition text-sm"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={busy}
          className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg transition text-sm font-bold disabled:opacity-50"
        >
          {busy ? 'Deleting...' : 'Delete my account for good'}
        </button>
      </div>
    </div>
  )
}