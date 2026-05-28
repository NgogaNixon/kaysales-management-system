import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function ChoosePlan() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [step, setStep] = useState(1) // 1 = choose plan, 2 = payment instructions, 3 = submit confirmation
  const [form, setForm] = useState({ sender_name: '', transaction_id: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const plans = [
    {
      id: 'standard',
      name: 'Standard',
      price: 50000,
      color: 'blue',
      features: [
        '1 Stock Category',
        'Sales Tracking',
        'Product Management',
        'Basic Dashboard',
        'Email Support',
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 80000,
      color: 'purple',
      popular: true,
      features: [
        '2+ Stock Categories',
        'Advanced Analytics',
        'Sales & Product Management',
        'Full Dashboard Access',
        'Priority Support',
        'Revenue Charts & Reports',
      ],
    },
  ]

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
    } else {
      // Update profile plan type
      await supabase
        .from('profiles')
        .update({ plan_type: selectedPlan.id })
        .eq('id', profile.id)
      setSuccess(true)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md text-center">
          <span className="text-5xl">🎉</span>
          <h2 className="text-2xl font-bold text-white mt-4 mb-2">Payment Submitted!</h2>
          <p className="text-gray-400 mb-2">
            Your payment confirmation has been sent to the admin for verification.
          </p>
          <p className="text-gray-400 mb-6">
            You will receive access once your payment is verified. This usually takes a few hours.
          </p>
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
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">K</span>
          </div>
          <span className="text-white font-bold text-xl">KaySales Management System</span>
        </div>
        {step === 1 && (
          <>
            <h1 className="text-3xl font-extrabold text-white mb-2">Choose Your Plan</h1>
            <p className="text-gray-400">Select the plan that fits your business needs</p>
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
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
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
              <h2 className={`text-xl font-bold mb-1 ${plan.popular ? 'text-white' : 'text-white'}`}>
                {plan.name}
              </h2>
              <div className={`text-4xl font-extrabold mb-1 ${plan.popular ? 'text-white' : 'text-white'}`}>
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
      )}

      {/* Step 2 — Payment Instructions + Form */}
      {step === 2 && selectedPlan && (
        <div className="max-w-md mx-auto space-y-4">

          {/* Selected Plan Summary */}
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

          {/* MTN Payment Instructions */}
          <div className="bg-yellow-900 border border-yellow-700 rounded-2xl p-6">
            <h3 className="text-yellow-300 font-bold text-lg mb-4">📱 MTN Mobile Money Payment</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="bg-yellow-700 text-yellow-200 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <p className="text-yellow-200 text-sm">Open your MTN Mobile Money app or dial <strong>*182#</strong></p>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-yellow-700 text-yellow-200 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <p className="text-yellow-200 text-sm">Send <strong>RWF {selectedPlan.price.toLocaleString()}</strong> to number: <strong className="text-white text-base">0785422754</strong></p>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-yellow-700 text-yellow-200 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <p className="text-yellow-200 text-sm">Use your <strong>full name</strong> as the payment reference</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-yellow-700 text-yellow-200 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                <p className="text-yellow-200 text-sm">Copy the <strong>transaction ID</strong> from your confirmation SMS and fill in the form below</p>
              </div>
            </div>
          </div>

          {/* Payment Confirmation Form */}
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