import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { PLANS, PLAN_ORDER, formatRwf } from '../lib/planConfig'
import AccountClosed from '../components/AccountClosed'

// Plans a client can buy by themselves: choose, pay by MTN and wait for the admin's approval.
// (A plan marked requiresAdminSetup in planConfig.js would be left out of this list.)
const SELF_SERVE_PLANS = PLAN_ORDER.map((id) => PLANS[id]).filter((plan) => !plan.requiresAdminSetup)

// Features a client gets during the 7-day free trial (the Standard plan)
const TRIAL_FEATURES = [
  'Dashboard Access',
  'Products Management',
  'Sales Tracking',
  'Credits Tracking',
  'Basic Analysis',
  'Excel & PDF Reports',
]

function Bullet({ className = 'bg-primary-light' }) {
  return <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${className}`}></span>
}

function ContactBox() {
  return (
    <div className="bg-surface border border-surface-border rounded-xl p-4 text-left space-y-2">
      <p className="text-white font-bold text-sm">Need quick access? Contact us:</p>
      <p className="text-gray-300 text-sm">Email: <a href="mailto:nixonngoga@gmail.com" className="text-primary-light hover:text-white">nixonngoga@gmail.com</a></p>
      <p className="text-gray-300 text-sm">Phone: <a href="tel:+250785422754" className="text-primary-light hover:text-white">+250 785 422 754</a></p>
    </div>
  )
}

export default function ChoosePlan() {
  const { profile, myProfile, isCeo } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // An approved client who wants the company feature comes here from the dashboard
  const isUpgrade = location.state?.upgrade === true
  const [selectedPlan, setSelectedPlan] = useState(isUpgrade ? PLANS.organization : null)
  const [step, setStep] = useState(isUpgrade ? 2 : 1)
  const [form, setForm] = useState({
    sender_name: '',
    transaction_id: '',
    company_name: profile?.company_name || '',
    company_phone: profile?.company_phone || '',
    company_location: profile?.company_location || '',
    company_tin: profile?.company_tin || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [trialSuccess, setTrialSuccess] = useState(false)

  const handleFreeTrial = async () => {
    setLoading(true)
    setError('')

    const { error } = await supabase.from('payment_requests').insert({
      user_id: profile.id,
      plan_type: 'standard',
      amount: 0,
      transaction_id: 'FREE-TRIAL',
      sender_name: profile.full_name,
      status: 'pending',
    })

    if (error) {
      setError('Failed to submit trial request. Please try again.')
      setLoading(false)
      return
    }

    setLoading(false)
    setTrialSuccess(true)
  }

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan)
    // Fill in the company details the client already saved
    setForm((prev) => ({
      ...prev,
      company_name: prev.company_name || profile?.company_name || '',
      company_phone: prev.company_phone || profile?.company_phone || '',
      company_location: prev.company_location || profile?.company_location || '',
      company_tin: prev.company_tin || profile?.company_tin || '',
    }))
    setStep(2)
  }

  const handleSubmitPayment = async () => {
    if (!form.sender_name || !form.transaction_id) {
      setError('Please fill in all fields')
      return
    }

    // A new company needs a name (a CEO who is renewing already has one)
    if (selectedPlan.id === 'organization' && !isCeo && !form.company_name.trim()) {
      setError('Please enter your company name')
      return
    }
    setLoading(true)
    setError('')

    const { error } = await supabase.from('payment_requests').insert({
      user_id: profile.id,
      plan_type: selectedPlan.id,
      amount: selectedPlan.price,
      transaction_id: form.transaction_id,
      sender_name: form.sender_name,
      status: 'pending',
    })

    if (error) {
      setError('Failed to submit. Please try again.')
      setLoading(false)
      return
    }

    // The plan is set by the admin when the payment is approved,
    // so only the company details are saved here
    const profileUpdate = {}
    // Save the company details for a company that does not exist yet
    if (selectedPlan.id === 'organization' && !isCeo) {
      profileUpdate.company_name = form.company_name.trim()
      profileUpdate.company_phone = form.company_phone.trim()
      profileUpdate.company_location = form.company_location.trim()
      profileUpdate.company_tin = form.company_tin.trim()
    }
    if (Object.keys(profileUpdate).length > 0) {
      await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', profile.id)
    }

    setLoading(false)
    setSuccess(true)
  }

  // A closed account cannot ask for a plan
  if ((myProfile || profile)?.is_deleted) {
    return <AccountClosed />
  }

  if (trialSuccess) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="bg-surface-elevated border border-surface-border rounded-2xl p-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Trial Request Submitted!</h2>
          <p className="text-gray-400 mb-4">
            Your free trial request has been sent to the admin for approval. You will get 7 days of access once approved.
          </p>
          <div className="mb-6">
            <ContactBox />
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="bg-surface-elevated border border-surface-border rounded-2xl p-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Payment Submitted!</h2>
          <p className="text-gray-400 mb-4">
            Your payment confirmation has been sent to the admin for verification. You will receive access once verified.
          </p>
          <div className="mb-4">
            <ContactBox />
          </div>
          <div className="bg-surface rounded-xl p-4 mb-6 text-left">
            <p className="text-gray-400 text-sm">Plan: <span className="text-white font-medium capitalize">{selectedPlan.name}</span></p>
            <p className="text-gray-400 text-sm mt-1">Amount: <span className="text-white font-medium">{formatRwf(selectedPlan.price)}</span></p>
            <p className="text-gray-400 text-sm mt-1">Transaction ID: <span className="text-white font-medium">{form.transaction_id}</span></p>
          </div>
          <button
            onClick={() => navigate(isUpgrade ? '/dashboard' : '/login')}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition"
          >
            {isUpgrade ? 'Back to Dashboard' : 'Back to Login'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface px-4 py-12">

      {/* Header */}
      <div className="text-center mb-10">
        <div
          onClick={() => navigate('/')}
          className="flex items-center justify-center gap-2 mb-4 cursor-pointer"
        >
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center hover:bg-primary-hover transition">
            <span className="text-white font-bold">K</span>
          </div>
          <span className="text-white font-bold text-xl">KaySales Management System</span>
        </div>
        {step === 1 && (
          <>
            <h1 className="text-3xl font-extrabold text-white mb-2">Choose Your Plan</h1>
            <p className="text-gray-400">Start free or choose a plan that fits your business</p>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="text-3xl font-extrabold text-white mb-2">{isUpgrade ? 'Upgrade to Organization' : 'Make Payment'}</h1>
            <p className="text-gray-400">Send payment via MTN Mobile Money</p>
          </>
        )}
      </div>

      {/* Step 1 — Choose Plan */}
      {step === 1 && (
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Free Trial Card */}
          <div className="bg-green-900 border-2 border-green-500 rounded-2xl p-8 text-center relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-4 py-1 rounded-full">
              START HERE
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">7-Day Free Trial</h2>
            <p className="text-green-300 mb-4">Try the Standard plan free — no payment required</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6 text-left max-w-lg mx-auto">
              {TRIAL_FEATURES.map((f, i) => (
                <p key={i} className="text-green-200 text-sm"><Bullet className="bg-green-400" />{f}</p>
              ))}
            </div>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <button
              onClick={handleFreeTrial}
              disabled={loading}
              className="px-10 py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 transition text-lg"
            >
              {loading ? 'Submitting...' : 'Start Free Trial →'}
            </button>
            <p className="text-green-400 text-xs mt-3">No payment required. Requires admin approval. Trial lasts 7 days.</p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 border-t border-surface-border"></div>
            <span className="text-gray-500 text-sm">or choose a paid plan</span>
            <div className="flex-1 border-t border-surface-border"></div>
          </div>

          {/* Paid Plans */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 mx-auto ${SELF_SERVE_PLANS.length >= 3 ? 'lg:grid-cols-3 max-w-5xl' : 'max-w-3xl'}`}>
            {SELF_SERVE_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-8 border ${
                  plan.popular
                    ? 'bg-primary border-primary-light'
                    : 'bg-surface-elevated border-surface-border'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 text-xs font-bold px-4 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                <h2 className="text-xl font-bold text-white mb-1">{plan.name}</h2>
                <div className="text-4xl font-extrabold text-white mb-1">
                  {formatRwf(plan.price)}
                </div>
                <p className={`text-sm mb-6 ${plan.popular ? 'text-indigo-200' : 'text-gray-500'}`}>per month</p>
                <ul className="space-y-2 mb-8">
                  {plan.highlights.map((f, i) => (
                    <li key={i} className={`text-sm ${plan.popular ? 'text-white' : 'text-gray-300'}`}>
                      <Bullet className={plan.popular ? 'bg-white' : 'bg-primary-light'} />{f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan(plan)}
                  className={`w-full py-3 rounded-xl font-bold transition ${
                    plan.popular
                      ? 'bg-white text-primary hover:bg-indigo-50'
                      : 'bg-primary text-white hover:bg-primary-hover'
                  }`}
                >
                  Choose {plan.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Payment */}
      {step === 2 && selectedPlan && (
        <div className="max-w-md mx-auto space-y-4">

          <div className="bg-surface-elevated border border-surface-border rounded-2xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Payment Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Plan</span>
                <span className="text-white font-medium capitalize">{selectedPlan.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount</span>
                <span className="text-green-400 font-bold">{formatRwf(selectedPlan.price)}</span>
              </div>
            </div>
          </div>

          {/* Company details: only for a new company (not for a CEO who is renewing) */}
          {selectedPlan.id === 'organization' && !isCeo && (
            <div className="bg-surface-elevated border border-surface-border rounded-2xl p-6">
              <h3 className="text-white font-bold text-lg mb-1">Your Company Details</h3>
              <p className="text-gray-500 text-sm mb-4">The admin will use these details to set up your company.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Company Name *</label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                    placeholder="e.g. KAY1 COMPANY LTD"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Company Phone</label>
                  <input
                    type="text"
                    value={form.company_phone}
                    onChange={(e) => setForm({ ...form, company_phone: e.target.value })}
                    className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                    placeholder="e.g. 0788000000"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Company Location</label>
                  <input
                    type="text"
                    value={form.company_location}
                    onChange={(e) => setForm({ ...form, company_location: e.target.value })}
                    className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                    placeholder="e.g. Kigali, Remera"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">TIN Number</label>
                  <input
                    type="text"
                    value={form.company_tin}
                    onChange={(e) => setForm({ ...form, company_tin: e.target.value })}
                    className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                    placeholder="e.g. 123456789"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="bg-yellow-900 border border-yellow-700 rounded-2xl p-6">
            <h3 className="text-yellow-300 font-bold text-lg mb-4">MTN Mobile Money Payment</h3>
            <div className="space-y-3">
              {[
                'Open your MTN Mobile Money app or dial *182#',
                `Send ${formatRwf(selectedPlan.price)} to number: 0785422754`,
                'Use your full name as the payment reference',
                'Copy the transaction ID from your SMS and fill in below',
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="bg-yellow-700 text-yellow-200 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                  <p className="text-yellow-200 text-sm">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-elevated border border-surface-border rounded-2xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Confirm Your Payment</h3>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Your Full Name *</label>
                <input
                  type="text"
                  value={form.sender_name}
                  onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                  className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">MTN Transaction ID *</label>
                <input
                  type="text"
                  value={form.transaction_id}
                  onChange={(e) => setForm({ ...form, transaction_id: e.target.value })}
                  className="w-full bg-surface border border-surface-border text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
                  placeholder="e.g. 1234567890"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => (isUpgrade ? navigate('/dashboard') : setStep(1))}
                  className="flex-1 py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmitPayment}
                  disabled={loading}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition"
                >
                  {loading ? 'Submitting...' : 'Submit Payment'}
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  )
}
