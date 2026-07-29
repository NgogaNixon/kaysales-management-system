import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Lightweight scroll-reveal — fades/lifts an element in once it enters the
// viewport. No animation library dependency, just IntersectionObserver.
function useReveal() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, visible]
}

function Reveal({ children, delay = 0, className = '' }) {
  const [ref, visible] = useReveal()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.6s ease-out ${delay}ms, transform 0.6s ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

const receiptLines = [
  { label: 'GATE MACHINE x2', value: '80,000' },
  { label: 'DECK LOCKS BLACK x4', value: '36,000' },
  { label: 'JEUX DE DOUCHE x1', value: '45,000' },
  { label: 'CREDIT — L. NKUSI', value: '—12,500' },
]
const receiptTotal = receiptLines.reduce(
  (sum, l) => sum + parseInt(l.value.replace(/[^0-9-]/g, '')), 0
)

const features = [
  {
    icon: '📦',
    title: 'Stock, tracked to the last unit',
    desc: 'Every product, quantity, and buying price in one place — with low-stock alerts before you run out, and Excel import for loading your whole catalogue in one go.',
  },
  {
    icon: '💰',
    title: 'Sales, however customers pay',
    desc: 'Cash, MTN Mobile Money, bank transfer, cheque, or credit — including partial payments, where the balance owed keeps tracking itself.',
  },
  {
    icon: '💳',
    title: 'A credit ledger that settles itself',
    desc: 'Money given or taken on credit, who owes what, and a one-tap "mark all as paid" for customers who finally clear their balance.',
  },
  {
    icon: '📝',
    title: 'Quotations that become sales',
    desc: "Send a customer a proper quote with a PDF they can keep — and when they say yes, convert it straight into a sale without re-typing anything.",
  },
  {
    icon: '📊',
    title: 'Know your actual profit',
    desc: 'Revenue, cost of goods, and expenses broken down by month — not just what came in, but what you actually kept.',
  },
  {
    icon: '📱',
    title: 'Runs on the phone you already have',
    desc: 'No special hardware — record a sale, check stock, or send a quote from any phone, anywhere your business takes you.',
  },
]

const steps = [
  { n: '01', title: 'Start your 7-day free trial', desc: 'No payment needed up front — just your name and business.' },
  { n: '02', title: 'Get approved', desc: 'A quick check on our end, usually same-day, and you\'re in.' },
  { n: '03', title: 'Run your business from your phone', desc: 'Stock, sales, credits, and quotes — wherever you are.' },
]

const plans = [
  {
    name: 'Standard',
    price: '25,000',
    period: '/month',
    features: [
      'Up to 2 stock categories',
      'Sales & product management',
      'Credits tracking (given & taken)',
      'Quotations with PDF export',
      'Basic dashboard & low-stock alerts',
      'Single user account',
    ],
  },
  {
    name: 'Premium',
    price: '50,000',
    period: '/month',
    popular: true,
    features: [
      'Unlimited stock categories',
      'Everything in Standard',
      'Convert quotations to sales in one tap',
      'Excel import/export for products',
      'Full financial breakdown (profit & expenses)',
      'Priority support',
    ],
  },
  {
    name: 'Lifetime',
    price: '800,000',
    period: 'one-time',
    features: [
      'Everything in Premium',
      'One payment — never expires',
      'Priority support for life',
    ],
  },
]

export default function Landing() {
  const navigate = useNavigate()
  const [printedLines, setPrintedLines] = useState(0)

  useEffect(() => {
    const timers = receiptLines.map((_, i) =>
      setTimeout(() => setPrintedLines(i + 1), 400 + i * 220)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="min-h-screen bg-[#151B3D] text-white overflow-x-hidden" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', system-ui, sans-serif; }
        .font-mono-plex { font-family: 'IBM Plex Mono', monospace; }
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-10px) rotate(-1deg); }
        }
        .receipt-float { animation: float 6s ease-in-out infinite; }
      `}</style>

      {/* ===== NAV ===== */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-[#151B3D]/80 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-[#F0A63C] flex items-center justify-center">
              <span className="text-[#151B3D] font-display font-bold">K</span>
            </div>
            <span className="font-display font-semibold text-lg">KaySales</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/70">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-sm text-white/80 hover:text-white transition">
              Login
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="text-sm font-medium bg-[#F0A63C] text-[#151B3D] px-4 py-2 rounded-lg hover:bg-[#f5b658] transition"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section className="max-w-6xl mx-auto px-6 pt-36 pb-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 font-mono-plex text-xs uppercase tracking-widest text-[#F0A63C]">
              🇷🇼 Built for Rwandan businesses
            </span>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight mt-4">
              Your paper ledger,<br />turned into a system.
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-white/70 mt-5 text-lg leading-relaxed max-w-md">
              Track stock, sales, and who owes you money — from your phone, in RWF, with MTN Mobile Money built in. No more torn receipts and forgotten balances.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex flex-wrap gap-3 mt-8">
              <button
                onClick={() => navigate('/signup')}
                className="bg-[#F0A63C] text-[#151B3D] font-medium px-6 py-3 rounded-lg hover:bg-[#f5b658] transition"
              >
                Start Free Trial →
              </button>
              <button
                onClick={() => navigate('/login')}
                className="border border-white/20 text-white px-6 py-3 rounded-lg hover:bg-white/5 transition"
              >
                Login to Dashboard
              </button>
            </div>
          </Reveal>
          <Reveal delay={400}>
            <p className="text-white/40 text-sm mt-4 font-mono-plex">No card required · Approved same-day</p>
          </Reveal>
        </div>

        {/* Signature element: the receipt-becomes-data card */}
        <Reveal delay={200}>
          <div className="flex justify-center">
            <div
              className="receipt-float bg-[#FAFAF7] text-[#151B3D] w-72 rounded-sm shadow-2xl px-6 py-6 relative"
              style={{
                clipPath: 'polygon(0 0, 100% 0, 100% 97%, 95% 100%, 90% 97%, 85% 100%, 80% 97%, 75% 100%, 70% 97%, 65% 100%, 60% 97%, 55% 100%, 50% 97%, 45% 100%, 40% 97%, 35% 100%, 30% 97%, 25% 100%, 20% 97%, 15% 100%, 10% 97%, 5% 100%, 0 97%)',
              }}
            >
              <p className="font-mono-plex text-xs text-center tracking-widest text-[#151B3D]/50 uppercase mb-1">KaySales Receipt</p>
              <p className="font-mono-plex text-[10px] text-center text-[#151B3D]/40 mb-4">14/07/2026 · General</p>
              <div className="border-t border-dashed border-[#151B3D]/20 pt-3 space-y-2">
                {receiptLines.map((line, i) => (
                  <div
                    key={i}
                    className="flex justify-between font-mono-plex text-xs"
                    style={{
                      opacity: i < printedLines ? 1 : 0,
                      transform: i < printedLines ? 'translateY(0)' : 'translateY(-6px)',
                      transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
                    }}
                  >
                    <span className="text-[#151B3D]/70">{line.label}</span>
                    <span className={line.value.startsWith('—') ? 'text-[#1B8A6B]' : ''}>{line.value}</span>
                  </div>
                ))}
              </div>
              <div
                className="border-t border-[#151B3D]/20 mt-4 pt-3 flex justify-between font-mono-plex text-sm font-medium"
                style={{
                  opacity: printedLines >= receiptLines.length ? 1 : 0,
                  transition: 'opacity 0.4s ease-out',
                }}
              >
                <span>TOTAL</span>
                <span>RWF {receiptTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===== TRUST STRIP (honest capability chips, no unverifiable claims) ===== */}
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap justify-center gap-x-10 gap-y-2 text-xs font-mono-plex text-white/50 uppercase tracking-wide">
          <span>RWF native</span>
          <span>MTN Mobile Money</span>
          <span>Works on any phone</span>
          <span>PDF receipts & quotes</span>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-24">
        <Reveal>
          <span className="font-mono-plex text-xs uppercase tracking-widest text-[#F0A63C]">What it does</span>
          <h2 className="font-display text-3xl font-bold mt-3 max-w-lg">
            Everything a shop's books actually need.
          </h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <div className="bg-white/[0.03] border-t-2 border-[#F0A63C]/60 rounded-lg p-6 h-full hover:bg-white/[0.06] hover:-translate-y-1 transition-all duration-300">
                <span className="text-2xl">{f.icon}</span>
                <h3 className="font-display font-semibold mt-4">{f.title}</h3>
                <p className="text-white/60 text-sm mt-2 leading-relaxed">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <Reveal>
          <span className="font-mono-plex text-xs uppercase tracking-widest text-[#1B8A6B]">Getting started</span>
          <h2 className="font-display text-3xl font-bold mt-3">Three steps in, not thirty.</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-8 mt-12">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div>
                <span className="font-mono-plex text-4xl font-medium text-white/15">{s.n}</span>
                <h3 className="font-display font-semibold text-lg mt-2">{s.title}</h3>
                <p className="text-white/60 text-sm mt-2">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-24">
        <Reveal>
          <span className="font-mono-plex text-xs uppercase tracking-widest text-[#F0A63C]">Pricing</span>
          <h2 className="font-display text-3xl font-bold mt-3">Start free. Pay when you're ready.</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6 mt-12 items-start">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 100}>
              <div
                className={`relative rounded-lg p-7 h-full border ${
                  plan.popular
                    ? 'bg-white text-[#151B3D] border-[#F0A63C] md:scale-[1.03] shadow-2xl'
                    : 'bg-white/[0.03] border-white/10'
                }`}
                style={{
                  borderTopWidth: '8px',
                  borderTopStyle: 'dashed',
                  borderTopColor: plan.popular ? '#F0A63C' : 'rgba(255,255,255,0.15)',
                }}
              >
                {plan.popular && (
                  <span className="absolute -top-3 right-6 bg-[#F0A63C] text-[#151B3D] text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                )}
                <h3 className="font-display font-semibold text-lg">{plan.name}</h3>
                <div className="mt-3 font-mono-plex">
                  <span className="text-3xl font-medium">RWF {plan.price}</span>
                  <span className={`text-sm ml-1 ${plan.popular ? 'text-[#151B3D]/50' : 'text-white/40'}`}>{plan.period}</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm">
                  {plan.features.map((feat) => (
                    <li key={feat} className={`flex gap-2 ${plan.popular ? 'text-[#151B3D]/80' : 'text-white/70'}`}>
                      <span className="text-[#1B8A6B]">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/signup')}
                  className={`w-full mt-7 py-3 rounded-lg font-medium transition ${
                    plan.popular
                      ? 'bg-[#151B3D] text-white hover:bg-[#0f1329]'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  Get Started
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <Reveal>
          <h2 className="font-display text-3xl md:text-4xl font-bold">
            Your books deserve better than a torn receipt.
          </h2>
          <button
            onClick={() => navigate('/signup')}
            className="mt-8 bg-[#F0A63C] text-[#151B3D] font-medium px-8 py-3.5 rounded-lg hover:bg-[#f5b658] transition"
          >
            Start Your Free Trial →
          </button>
        </Reveal>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-white/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#F0A63C] flex items-center justify-center">
              <span className="text-[#151B3D] font-display font-bold text-sm">K</span>
            </div>
            <span className="font-display font-semibold text-white">KaySales Management System</span>
          </div>
          <div className="text-xs text-center font-mono-plex">
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