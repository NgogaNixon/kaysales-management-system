import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function OTPVerify({ onVerified, onCancel, actionLabel }) {
  const { profile } = useAuth()
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  const verifyPassword = async () => {
    if (!password) {
      setError('Please enter your password')
      return
    }
    setVerifying(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: profile.email,
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
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">🔐 Confirm Action</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="bg-red-900 border border-red-700 rounded-lg p-3">
            <p className="text-red-300 text-sm font-medium">⚠️ You are about to: <span className="text-white">{actionLabel}</span></p>
            <p className="text-red-400 text-xs mt-1">Enter your password to confirm this action.</p>
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Your Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && verifyPassword()}
              className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter your password"
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">
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