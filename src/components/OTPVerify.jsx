import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function OTPVerify({ email, onVerified, onCancel, actionLabel }) {
  const [otp, setOtp] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    let timer
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(c => c - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [cooldown])

  const sendOTP = async () => {
    if (cooldown > 0) return
    setSending(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: null
      }
    })
    if (error) {
      setError('Failed to send OTP. Please wait 60 seconds before trying again.')
      setCooldown(60)
    } else {
      setSent(true)
      setCooldown(60)
    }
    setSending(false)
  }

  const verifyOTP = async () => {
    if (!otp || otp.length < 6) {
      setError('Please enter the 6-digit OTP')
      return
    }
    setVerifying(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'magiclink'
    })
    if (error) {
      setError('Invalid or expired OTP. Please try again.')
    } else {
      onVerified()
    }
    setVerifying(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">🔐 Verify Identity</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="bg-red-900 border border-red-700 rounded-lg p-3">
            <p className="text-red-300 text-sm font-medium">⚠️ You are about to: <span className="text-white">{actionLabel}</span></p>
            <p className="text-red-400 text-xs mt-1">This action requires email verification.</p>
          </div>

          {!sent ? (
            <>
              <p className="text-gray-400 text-sm">
                We will send a 6-digit verification code to: <span className="text-white font-medium">{email}</span>
              </p>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              {cooldown > 0 && (
                <p className="text-yellow-400 text-sm text-center">Please wait {cooldown}s before resending</p>
              )}
              <div className="flex gap-3">
                <button onClick={onCancel} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">
                  Cancel
                </button>
                <button
                  onClick={sendOTP}
                  disabled={sending || cooldown > 0}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${
                    cooldown > 0
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {sending ? 'Sending...' : cooldown > 0 ? `Wait ${cooldown}s` : 'Send OTP'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-400 text-sm">
                Enter the 6-digit code sent to <span className="text-white font-medium">{email}</span>
              </p>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-lg text-center text-2xl tracking-widest focus:outline-none focus:border-blue-500"
                placeholder="000000"
                maxLength={6}
                autoFocus
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <p className="text-gray-500 text-xs text-center">Code expires in 5 minutes</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (cooldown === 0) {
                      setSent(false)
                      setOtp('')
                      setError('')
                    }
                  }}
                  disabled={cooldown > 0}
                  className={`flex-1 py-2 rounded-lg text-sm transition ${
                    cooldown > 0
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
                </button>
                <button
                  onClick={verifyOTP}
                  disabled={verifying || otp.length < 6}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50"
                >
                  {verifying ? 'Verifying...' : 'Confirm'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}