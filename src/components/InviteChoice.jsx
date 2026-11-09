import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import DeleteMyAccount from './DeleteMyAccount'

// Shown when someone is invited to a company but already uses KaySales
// in another account. They must choose what to do.
export default function InviteChoice() {
  const { inviteChoice, refetchProfile, decideLater } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showDelete, setShowDelete] = useState(false)

  const reason = inviteChoice?.reason
  const invited = inviteChoice?.invite_company
  const current = inviteChoice?.current_company

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Leave the current company, then the invitation is accepted at once
  const handleLeave = async () => {
    setBusy(true)
    setError('')
    const { error: leaveError } = await supabase.rpc('leave_my_company')
    if (leaveError) {
      setError('Could not leave the company: ' + leaveError.message)
      setBusy(false)
      return
    }
    await refetchProfile()
    setBusy(false)
  }

  const handleDecline = async () => {
    setBusy(true)
    setError('')
    const { error: declineError } = await supabase.rpc('decline_my_invite')
    if (declineError) {
      setError('Could not decline the invitation: ' + declineError.message)
      setBusy(false)
      return
    }
    await refetchProfile()
    setBusy(false)
  }

  // The account was closed by the admin
  if (reason === 'closed') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="bg-surface-elevated border border-red-800 rounded-2xl p-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Account closed</h2>
          <p className="text-gray-400 mb-6">
            This account was closed, so it cannot join a company. Please contact the KaySales admin.
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

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-8">
      <div className="bg-surface-elevated border border-surface-border rounded-2xl p-8 w-full max-w-lg">
        <h2 className="text-2xl font-bold text-white mb-2">You are invited to join {invited}</h2>
        <p className="text-gray-400 text-sm mb-4">
          Role: <span className="text-white font-medium">{inviteChoice?.role_label}</span>
        </p>

        {reason === 'member' && (
          <p className="text-gray-300 text-sm mb-4">
            You already use KaySales as part of <strong className="text-white">{current}</strong>.
            A person can belong to only one company, so please choose what to do.
          </p>
        )}
        {reason === 'owner' && (
          <p className="text-gray-300 text-sm mb-4">
            You are the owner of <strong className="text-white">{current}</strong>, and an owner cannot join
            another company with the same account. To join {invited}, first remove your team members in
            Team, delete this account, then sign up again with this email. Or decline, and ask {invited} to
            invite a different email.
          </p>
        )}
        {reason === 'client' && (
          <p className="text-gray-300 text-sm mb-4">
            You already have your own KaySales account. To join {invited} with this email, you must first
            delete your existing account (your products, sales and other data are removed), then sign up
            again with the same email. Or decline, and ask {invited} to invite a different email.
          </p>
        )}

        {error && (
          <p className="text-red-300 text-sm bg-red-900 border border-red-700 rounded-lg p-3 mb-4">{error}</p>
        )}

        {!showDelete ? (
          <div className="space-y-3">
            {reason === 'member' && (
              <button
                onClick={handleLeave}
                disabled={busy}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition disabled:opacity-50"
              >
                Leave {current} and join {invited}
              </button>
            )}
            <button
              onClick={handleDecline}
              disabled={busy}
              className="w-full py-3 bg-surface border border-surface-border text-white rounded-xl font-medium hover:border-primary transition disabled:opacity-50"
            >
              Decline this invitation
            </button>
            <button
              onClick={() => setShowDelete(true)}
              disabled={busy}
              className="w-full py-3 bg-red-900 border border-red-700 text-red-200 rounded-xl font-medium hover:bg-red-800 transition disabled:opacity-50"
            >
              Delete my existing account
            </button>
            <button
              onClick={decideLater}
              disabled={busy}
              className="w-full py-2 text-gray-400 hover:text-white text-sm transition"
            >
              Decide later
            </button>
          </div>
        ) : (
          <DeleteMyAccount
            warning={`This permanently deletes your account and everything in it. Afterwards, sign up again with the same email and confirm it to join ${invited}.`}
            doneMessage={`Your account was deleted. To join ${invited}, sign up again with the same email and confirm it.`}
            goTo="/signup"
            onCancel={() => setShowDelete(false)}
          />
        )}

        <button onClick={logout} className="mt-6 text-gray-500 hover:text-gray-300 text-xs">
          Logout
        </button>
      </div>
    </div>
  )
  
}
