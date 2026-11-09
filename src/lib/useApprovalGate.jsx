import { useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'

// Company staff cannot delete (or make sensitive changes to) records on their
// own. The CEO - or a manager the CEO trusts - has to approve each one first.
//
// How a page uses it:
//
//   const { gate, approvalDialog } = useApprovalGate()
//   ...
//   gate({
//     entityType: 'product',            // product, sale, credit_given, credit_taken, quotation, expense
//     entityId: product.id,
//     action: 'delete',                 // delete or edit
//     summary: `Delete product: ${product.name}`,
//     onProceed: () => handleDelete(product),   // the page's existing code
//     // deferConsume: true,            // only for multi-step edits: the approval is NOT used up
//   })                                  // when onProceed returns, the page calls consumeApproval(id)
//                                       // itself once the whole edit has been saved
//   ...
//   {approvalDialog}                    // render once, anywhere in the page
//
// - CEO, managers acting as the owner's account and normal clients: onProceed runs straight away,
//   exactly as before (the page's own password check still applies).
// - Staff: if an approved, unused request exists for this record, onProceed runs
//   once and the approval is used up. Otherwise a small window asks for the
//   request (or shows that it is waiting / was rejected).
export function useApprovalGate() {
  const { user, myProfile, isOrgStaff, organization } = useAuth()
  const [dialog, setDialog] = useState(null) // { req, latest }
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Uses an approval up. Pages with a multi-step edit call this after saving.
  const consumeApproval = async (id) => {
    await supabase.rpc('consume_approval', { p_id: id })
  }

  const closeDialog = () => {
    setDialog(null)
    setReason('')
    setError('')
    setBusy(false)
  }

  const gate = async (req) => {
    if (!isOrgStaff) {
      await req.onProceed(null)
      return
    }

    const { data: latest } = await supabase
      .from('approval_requests')
      .select('*')
      .eq('entity_type', req.entityType)
      .eq('entity_id', String(req.entityId))
      .eq('action', req.action)
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const usable =
      latest &&
      latest.status === 'approved' &&
      !latest.consumed_at &&
      latest.expires_at &&
      new Date(latest.expires_at) > new Date()

    if (usable) {
      try {
        await req.onProceed(latest)
        // Use the approval up: it works once (edits that open a form first keep it until saved)
        if (!req.deferConsume) await supabase.rpc('consume_approval', { p_id: latest.id })
      } catch (e) {
        setDialog({ req, latest: null, failed: true })
        setError(e?.message || 'Something went wrong. Your approval is still valid, please try again.')
      }
      return
    }

    setDialog({ req, latest })
  }

  const sendRequest = async () => {
    setBusy(true)
    setError('')
    const { req } = dialog
    const { error: insertError } = await supabase.from('approval_requests').insert({
      organization_id: organization.id,
      owner_id: organization.owner_id,
      entity_type: req.entityType,
      entity_id: String(req.entityId),
      action: req.action,
      summary: req.summary,
      reason: reason.trim() || null,
      requester_name: myProfile?.full_name || user.email,
    })
    setBusy(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setDialog({ ...dialog, latest: { status: 'pending' }, justSent: true })
  }

  const cancelRequest = async () => {
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase
      .from('approval_requests')
      .update({ status: 'cancelled' })
      .eq('id', dialog.latest.id)
    setBusy(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    closeDialog()
  }

  let approvalDialog = null
  if (dialog) {
    const status = dialog.latest?.status
    const waiting = status === 'pending'
    const rejected = status === 'rejected'
    approvalDialog = (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
        <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
            <h2 className="text-lg font-bold text-white">
              {waiting ? 'Waiting for approval' : rejected ? 'Request was declined' : 'Approval needed'}
            </h2>
            <button onClick={closeDialog} className="text-gray-400 hover:text-white text-xl">✕</button>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div className="bg-surface rounded-lg p-3">
              <p className="text-gray-400 text-xs">You want to</p>
              <p className="text-white text-sm font-medium mt-1">{dialog.req.summary}</p>
            </div>

            {dialog.failed && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            {waiting && !dialog.failed && (
              <>
                <p className="text-gray-300 text-sm">
                  {dialog.justSent
                    ? 'Your request has been sent to the company owner.'
                    : 'You already asked for this and it has not been answered yet.'}{' '}
                  Once it is approved, open this action again and it will go through. An approval can be used once and lasts 24 hours.
                </p>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3">
                  {!dialog.justSent && (
                    <button
                      onClick={cancelRequest}
                      disabled={busy}
                      className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition disabled:opacity-50"
                    >
                      Cancel my request
                    </button>
                  )}
                  <button
                    onClick={closeDialog}
                    className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium"
                  >
                    OK
                  </button>
                </div>
              </>
            )}

            {!waiting && !dialog.failed && (
              <>
                {rejected && (
                  <div className="bg-red-900 border border-red-700 rounded-lg p-3">
                    <p className="text-red-300 text-sm">Your last request for this was declined.</p>
                    {dialog.latest.decision_note && (
                      <p className="text-red-200 text-xs mt-1">Reason: {dialog.latest.decision_note}</p>
                    )}
                  </div>
                )}
                <p className="text-gray-300 text-sm">
                  This action needs the approval of the company owner. Send a request and, once it is approved, open this action again.
                </p>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Reason (optional)</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                    placeholder="Tell the owner why, for example: wrong price entered"
                  />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={closeDialog}
                    className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendRequest}
                    disabled={busy}
                    className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium disabled:opacity-50"
                  >
                    {busy ? 'Sending...' : 'Send request'}
                  </button>
                </div>
              </>
            )}

            {dialog.failed && (
              <button
                onClick={closeDialog}
                className="w-full py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium"
              >
                OK
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return { gate, approvalDialog, consumeApproval, isStaff: isOrgStaff }
}
