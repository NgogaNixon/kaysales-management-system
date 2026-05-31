import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function ChoosePlan() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ sender_name: '', transaction_id: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [trialSuccess, setTrialSuccess] = useState(false)

  const plans = [
    {
      id: 'standard',
      name: 'Standard',
      price: 45000,
      popular: false,
      features: [
        'Up to 2 Stock Categories',
        'Sales Tracking',
        'Product Management',
        'Credits Tracking',
        'Basic Dashboard',
        'Email Support',
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 80000,
      popular: true,
      features: [
        'Unlimited Stock Categories',
        'Advanced Analytics',
        'Sales & Product Management',
        'Full Dashboard Access',
        'Priority Support',
        'Revenue Charts & Reports',
      ],
    },
  ]

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
    setStep(2)
  }

  const handleSubmitPayment = async () => {
    if (!form.sender_name || !form.transaction_id) {
      setError('Please fill in all fields')
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

    await supabase
      .from('profiles')
      .update({ plan_type: selectedPlan.id })
      .eq('id', profile.id)

    setLoading(false)
    setSuccess(true)
  }

  if (trialSuccess) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md text-center">
          <span className="text-5xl">🎉</span>
          <h2 className="text-2xl font-bold text-white mt-4 mb-2">Trial Request Submitted!</h2>
          <p className="text-gray-400 mb-4">
            Your free trial request has been sent to the admin for approval. You will get 7 days of full access once approved.
          </p>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6 text-left space-y-2">
            <p className="text-white font-bold text-sm">Need quick access? Contact us:</p>
            <p className="text-gray-300 text-sm">📧 <a href="mailto:nixonngoga@gmail.com" className="text-blue-400 hover:text-blue-300">nixonngoga@gmail.com</a></p>
            <p className="text-gray-300 text-sm">📱 <a href="tel:+250785422754" className="text-blue-400 hover:text-blue-300">+250 785 422 754</a></p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md text-center">
          <span className="text-5xl">🎉</span>
          <h2 className="text-2xl font-bold text-white mt-4 mb-2">Payment Submitted!</h2>
          <p className="text-gray-400 mb-4">
            Your payment confirmation has been sent to the admin for verification. You will receive access once verified.
          </p>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4 text-left space-y-2">
            <p className="text-white font-bold text-sm">Need quick access? Contact us:</p>
            <p className="text-gray-300 text-sm">📧 <a href="mailto:nixonngoga@gmail.com" className="text-blue-400 hover:text-blue-300">nixonngoga@gmail.com</a></p>
            <p className="text-gray-300 text-sm">📱 <a href="tel:+250785422754" className="text-blue-400 hover:text-blue-300">+250 785 422 754</a></p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 mb-6 text-left">
            <p className="text-gray-400 text-sm">Plan: <span className="text-white font-medium capitalize">{selectedPlan.name}</span></p>
            <p className="text-gray-400 text-sm mt-1">Amount: <span className="text-white font-medium">RWF {selectedPlan.price.toLocaleString()}</span></p>
            <p className="text-gray-400 text-sm mt-1">Transaction ID: <span className="text-white font-medium">{form.transaction_id}</span></p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-12">

      {/* Header */}
      <div className="text-center mb-10">
        <div
          onClick={() => navigate('/')}
          className="flex items-center justify-center gap-2 mb-4 cursor-pointer"
        >
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-700 transition">
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
            <h1 className="text-3xl font-extrabold text-white mb-2">Make Payment</h1>
            <p className="text-gray-400">Send payment via MTN Mobile Money</p>
          </>
        )}
      </div>

      {/* Step 1 — Choose Plan */}
      {step === 1 && (
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Free Trial Card */}
          <div className="bg-green-900 border-2 border-green-500 rounded-2xl p-8 text-center relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-4 py-1 rounded-full">
              START HERE
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">7-Day Free Trial</h2>
            <p className="text-green-300 mb-4">Full access to all features — no payment required</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6 text-left max-w-lg mx-auto">
              {[
                '✅ Full Dashboard Access',
                '✅ Products Management',
                '✅ Sales Tracking',
                '✅ Credits Tracking',
                '✅ Analysis & Charts',
                '✅ Excel & PDF Reports',
              ].map((f, i) => (
                <p key={i} className="text-green-200 text-sm">{f}</p>
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
            <div className="flex-1 border-t border-gray-700"></div>
            <span className="text-gray-500 text-sm">or choose a paid plan</span>
            <div className="flex-1 border-t border-gray-700"></div>
          </div>

          {/* Paid Plans */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-8 border ${
                  plan.popular
                    ? 'bg-blue-600 border-blue-500'
                    : 'bg-gray-900 border-gray-800'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 text-xs font-bold px-4 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                <h2 className="text-xl font-bold text-white mb-1">{plan.name}</h2>
                <div className="text-4xl font-extrabold text-white mb-1">
                  RWF {plan.price.toLocaleString()}
                </div>
                <p className={`text-sm mb-6 ${plan.popular ? 'text-blue-200' : 'text-gray-500'}`}>per month</p>
                <ul className="space-y-2 mb-8">
                  {plan.features.map((f, i) => (
                    <li key={i} className={`text-sm ${plan.popular ? 'text-white' : 'text-gray-300'}`}>
                      ✅ {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan(plan)}
                  className={`w-full py-3 rounded-xl font-bold transition ${
                    plan.popular
                      ? 'bg-white text-blue-600 hover:bg-blue-50'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
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

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">📋 Payment Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Plan</span>
                <span className="text-white font-medium capitalize">{selectedPlan.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount</span>
                <span className="text-green-400 font-bold">RWF {selectedPlan.price.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-900 border border-yellow-700 rounded-2xl p-6">
            <h3 className="text-yellow-300 font-bold text-lg mb-4">📱 MTN Mobile Money Payment</h3>
            <div className="space-y-3">
              {[
                'Open your MTN Mobile Money app or dial *182#',
                `Send RWF ${selectedPlan.price.toLocaleString()} to number: 0785422754`,
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

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">✅ Confirm Your Payment</h3>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Your Full Name *</label>
                <input
                  type="text"
                  value={form.sender_name}
                  onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">MTN Transaction ID *</label>
                <input
                  type="text"
                  value={form.transaction_id}
                  onChange={(e) => setForm({ ...form, transaction_id: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g. 1234567890"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmitPayment}
                  disabled={loading}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
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