import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Signup() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
const [success, setSuccess] = useState(false)
  const disposableDomains = [
    'mailinator.com', 'tempmail.com', 'guerrillamail.com', 'throwaway.email',
    'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
    'guerrillamail.info', 'spam4.me', 'trashmail.com', 'dispostable.com',
    'maildrop.cc', 'spamgourmet.com', 'getairmail.com', 'filzmail.com',
    'throwam.com', 'tempr.email', 'discard.email', 'spamfree24.org',
    'mailnull.com', 'spamspot.com', 'spamthisplease.com', 'binkmail.com',
    'safetymail.info', 'tempinbox.com', 'fakeinbox.com', 'mailnew.com',
    'spamevader.net', 'trashmail.io', 'tempmail.ninja', 'moakt.com',
    'mohmal.com', 'temp-mail.org', 'emailondeck.com', 'spamgourmet.net',
  ]

  const isDisposableEmail = (email) => {
    const domain = email.split('@')[1]?.toLowerCase()
    return disposableDomains.includes(domain)
  }

  const handleSignup = async (e) => {
    e.preventDefault()
   setLoading(true)
    setError('')

    if (isDisposableEmail(email)) {
      setError('Please use a valid business or personal email address. Disposable emails are not allowed.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Check Your Email</h2>
          <p className="text-gray-400 mb-6">
            We sent a confirmation link to <span className="text-white font-medium">{email}</span>. Click it to confirm your account.
          </p>
          <a href="/login" className="block w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition">
            Back to Login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            onClick={() => navigate('/')}
            className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4 cursor-pointer hover:bg-blue-700 transition"
          >
            <span className="text-white font-bold text-xl">K</span>
          </div>
          <h1 className="text-2xl font-bold text-white">KaySales Management System</h1>
          <p className="text-gray-400 text-sm mt-1">Create your account</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          {error && (
            <div className="bg-red-900 border border-red-700 text-red-300 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm font-medium mb-2">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-blue-500 transition"
                placeholder="Enter your full name"
                required
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-blue-500 transition"
                placeholder="Enter your email"
                required
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-blue-500 transition"
                placeholder="Create a strong password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition mt-2"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
          <div className="mt-6 text-center space-y-2">
            <p className="text-gray-500 text-sm">
              Already have an account?{' '}
              <a href="/login" className="text-blue-400 hover:text-blue-300 transition">
                Sign In
              </a>
            </p>
            <button
              onClick={() => navigate('/')}
              className="text-gray-500 hover:text-gray-300 text-sm transition block w-full mt-2"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}