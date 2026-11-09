import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function OTPVerify({ onVerified, onCancel, actionLabel }) {
  const { profile, myProfile } = useAuth()
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  // The password belongs to the person who is really logged in. For company
  // staff the working profile is the company owner's, so its email must never
  // be used here (it would switch the session to the owner's account).
  const email = (myProfile || profile)?.email

  const verifyPassword = async () => {
    if (!password) {
      setError('Please enter your password')
      return
    }
    setVerifying(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Incorrect password. Please try again.')
    } else {
      onVerified()
    }
    setVerifying(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-bold text-white">Confirm Action</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="bg-red-900 border border-red-700 rounded-lg p-3">
            <p className="text-red-300 text-sm font-medium">You are about to: <span className="text-white">{actionLabel}</span></p>
            <p className="text-red-400 text-xs mt-1">Enter your password to confirm this action.</p>
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Your Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && verifyPassword()}
              className="w-full bg-surface border border-surface-border text-white px-4 py-3 rounded-lg focus:outline-none focus:border-primary"
              placeholder="Enter your password"
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition">
              Cancel
            </button>
            <button
              onClick={verifyPassword}
              disabled={verifying || !password}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
