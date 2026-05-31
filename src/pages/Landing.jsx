import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [dark])

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-300">

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white dark:bg-gray-900 shadow-sm px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="font-bold text-gray-800 dark:text-white text-lg">KaySales</span>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => setDark(!dark)}
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-xl"
          >
            {dark ? '☀️' : '🌙'}
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 text-blue-600 font-medium hover:bg-blue-50 dark:hover:bg-gray-800 rounded-lg transition"
          >
            Login
          </button>
          <button
            onClick={() => navigate('/signup')}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <span>🇷🇼</span>
            <span>Built for Rwandan Businesses</span>
          </div>
          <h1 className="text-5xl font-extrabold text-gray-900 dark:text-white leading-tight mb-6">
            Manage Your Sales &<br />
            <span className="text-blue-600">Stock Smarter</span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
            KaySales Management System helps Rwandan businesses track sales, manage products, and grow — all in one place. Simple, powerful, and built for you.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/signup')}
              className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition text-lg shadow-lg shadow-blue-200"
            >
              Start Free Trial →
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-4 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold rounded-xl hover:bg-blue-50 dark:hover:bg-gray-700 transition text-lg border-2 border-blue-200 dark:border-gray-700"
            >
              Login to Dashboard
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-3 gap-6">
          {[
            { number: '500+', label: 'Businesses Served' },
            { number: 'RWF', label: 'Local Currency Support' },
            { number: '24/7', label: 'Always Available' },
          ].map((stat, i) => (
            <div key={i} className="text-center bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="text-3xl font-extrabold text-blue-600">{stat.number}</div>
              <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-white dark:bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-4">
              Everything You Need to Run Your Business
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg">Powerful tools built for simplicity</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '📦', title: 'Product Management', desc: 'Add, edit and track your stock with ease. Know exactly what you have at all times.' },
              { icon: '💰', title: 'Sales Tracking', desc: 'Record every sale instantly. View your history and never lose track of a transaction.' },
              { icon: '📊', title: 'Sales Analysis', desc: 'Beautiful charts that show your best products, peak times, and total revenue in RWF.' },
              { icon: '👑', title: 'Admin Control', desc: 'Full admin panel to approve clients, manage subscriptions and control access.' },
              { icon: '🔐', title: 'Secure Access', desc: 'Email OTP verification and role-based access keep your data safe.' },
              { icon: '📱', title: 'Mobile Friendly', desc: 'Works perfectly on any device — phone, tablet or computer.' },
            ].map((feature, i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 hover:shadow-md transition border border-gray-100 dark:border-gray-700">
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="font-bold text-gray-800 dark:text-white text-lg mb-2">{feature.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg">Choose the plan that fits your business</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {/* Standard Plan */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="text-gray-500 dark:text-gray-400 font-medium mb-2">Standard</div>
              <div className="text-4xl font-extrabold text-gray-900 dark:text-white mb-1">RWF 45,000</div>
              <div className="text-gray-400 text-sm mb-6">per month</div>
              <ul className="space-y-3 mb-8">
                {[
                  '✅ Up to 2 Stock Categories',
                  '✅ Sales Tracking',
                  '✅ Product Management',
                  '✅ Basic Dashboard',
                  '✅ Email Support',
                ].map((item, i) => (
                  <li key={i} className="text-gray-600 dark:text-gray-300 text-sm">{item}</li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/signup')}
                className="w-full py-3 border-2 border-blue-600 text-blue-600 font-bold rounded-xl hover:bg-blue-50 dark:hover:bg-gray-700 transition"
              >
                Get Started
              </button>
            </div>

            {/* Premium Plan */}
            <div className="bg-blue-600 rounded-2xl p-8 shadow-xl relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 text-xs font-bold px-4 py-1 rounded-full">
                MOST POPULAR
              </div>
              <div className="text-blue-200 font-medium mb-2">Premium</div>
              <div className="text-4xl font-extrabold text-white mb-1">RWF 80,000</div>
              <div className="text-blue-300 text-sm mb-6">per month</div>
              <ul className="space-y-3 mb-8">
                {[
                  '✅ Unlimited Stock Categories',
                  '✅ Advanced Analytics',
                  '✅ Sales & Product Management',
                  '✅ Full Dashboard Access',
                  '✅ Priority Support',
                  '✅ Revenue Charts & Reports',
                ].map((item, i) => (
                  <li key={i} className="text-white text-sm">{item}</li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/signup')}
                className="w-full py-3 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 dark:bg-black text-gray-400 py-12 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            <span className="font-bold text-white text-lg">KaySales Management System</span>
          </div>
          <div className="text-sm text-center">
            © 2026 KaySales Management System. All rights reserved. 🇷🇼 Rwanda
          </div>
          <div className="flex gap-6 text-sm">
            <button onClick={() => navigate('/login')} className="hover:text-white transition">Login</button>
            <button onClick={() => navigate('/signup')} className="hover:text-white transition">Sign Up</button>
          </div>
        </div>
      </footer>

    </div>
  )
}