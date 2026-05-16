import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Scan, BarChart2, ShieldCheck, Users, CheckCircle,
  ChevronDown, Menu, X, ArrowRight, Star, Clock, Smartphone,
  FileText, Zap, Lock
} from 'lucide-react';

// ─── Nav ──────────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black text-gray-900">ShuleMeal</span>
            <span className="hidden sm:inline text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">Cards</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition">How it works</a>
            <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition">Pricing</a>
            <a href="#contact" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition">Contact</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate('/app')}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition">
              Sign In
            </button>
            <a href="#contact"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition">
              Get Started Free
            </a>
          </div>

          {/* Mobile menu button */}
          <button onClick={() => setOpen(!open)} className="md:hidden p-2 text-gray-600">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
          {['#features', '#how-it-works', '#pricing', '#contact'].map(href => (
            <a key={href} href={href} onClick={() => setOpen(false)}
              className="block text-sm font-medium text-gray-700 py-2 capitalize">
              {href.slice(1).replace('-', ' ')}
            </a>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <button onClick={() => navigate('/app')} className="w-full border border-indigo-600 text-indigo-600 font-bold py-2 rounded-lg text-sm">Sign In</button>
            <a href="#contact" className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg text-sm text-center">Get Started Free</a>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────
function Hero() {
  const navigate = useNavigate();
  return (
    <section className="pt-28 pb-20 bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
      <div className="max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full mb-6">
          <Zap className="w-3.5 h-3.5" /> Now with QR code scanning
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 leading-tight mb-6">
          Smarter Meal Management<br />
          <span className="text-indigo-600">for Kenyan Schools</span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
          Replace paper meal registers with digital meal cards. Track payments, scan QR codes at the dining hall, and get instant reports — all in one system.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="#contact"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-4 rounded-xl text-lg transition shadow-lg shadow-indigo-200">
            Start Free 30-Day Trial <ArrowRight className="w-5 h-5" />
          </a>
          <button onClick={() => navigate('/app')}
            className="inline-flex items-center justify-center gap-2 bg-white border-2 border-gray-200 hover:border-indigo-300 text-gray-700 font-bold px-8 py-4 rounded-xl text-lg transition">
            Sign In to Your School
          </button>
        </div>
        <p className="text-sm text-gray-400 mt-4">No credit card required · Free 30-day trial · Cancel anytime</p>

        {/* Mock dashboard preview */}
        <div className="mt-16 relative max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="w-6 h-6 text-white" />
                <span className="text-white font-bold">ShuleMeal Cards — Admin Dashboard</span>
              </div>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4">
              {[
                { label: 'Total Collected', value: 'KSh 124,500', color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Active Cards', value: '312 Students', color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Expiring Soon', value: '14 Cards', color: 'text-orange-600', bg: 'bg-orange-50' },
              ].map(stat => (
                <div key={stat.label} className={`${stat.bg} rounded-xl p-4`}>
                  <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
                  <p className={`text-xl font-black ${stat.color} mt-1`}>{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6">
              <div className="bg-gray-50 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                  <span className="font-bold text-gray-700 text-sm">Recent Records</span>
                  <span className="text-xs text-indigo-600 font-semibold">View all</span>
                </div>
                {[
                  { name: 'Hezbon Oduol', adm: '0989', due: '2026-05-08', status: 'Active' },
                  { name: 'Winfred Otieno', adm: '0990', due: '2026-04-24', status: 'Active' },
                  { name: 'Jennifer Atieno', adm: '0991', due: '2026-05-08', status: 'Active' },
                ].map(s => (
                  <div key={s.adm} className="px-4 py-3 flex items-center justify-between border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{s.name}</p>
                      <p className="text-xs text-gray-400">ADM: {s.adm}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded">{s.status}</span>
                      <p className="text-xs text-gray-400 mt-1">Due: {s.due}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Floating scan result card */}
          <div className="absolute -right-4 top-1/2 -translate-y-1/2 bg-green-500 text-white rounded-2xl shadow-xl p-4 w-44 hidden lg:block">
            <CheckCircle className="w-8 h-8 mb-2" />
            <p className="font-black text-lg">VALID MEAL</p>
            <p className="text-green-100 text-xs font-medium">Hezbon Oduol</p>
            <p className="text-green-200 text-xs">Valid until 2026-05-08</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────
function Features() {
  const features = [
    {
      icon: <CreditCard className="w-6 h-6 text-indigo-600" />,
      bg: 'bg-indigo-50',
      title: 'Digital Meal Cards',
      desc: 'Generate printable meal cards with unique QR codes for every student. No more paper registers or manual ticking.',
    },
    {
      icon: <Scan className="w-6 h-6 text-teal-600" />,
      bg: 'bg-teal-50',
      title: 'QR Code Scanner',
      desc: 'Kitchen staff scan cards using any smartphone camera. Instantly see if a student\'s meal plan is active or expired.',
    },
    {
      icon: <BarChart2 className="w-6 h-6 text-purple-600" />,
      bg: 'bg-purple-50',
      title: 'Management Reports',
      desc: 'See daily meal attendance, total collections, active vs expired cards, and export full PDF reports anytime.',
    },
    {
      icon: <Users className="w-6 h-6 text-blue-600" />,
      bg: 'bg-blue-50',
      title: 'Role-Based Access',
      desc: 'Separate logins for the school admin (full access) and teacher on duty (scanner + student lookup only).',
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-green-600" />,
      bg: 'bg-green-50',
      title: 'Secure & Isolated',
      desc: 'Each school\'s data is completely separate. Students, payments, and scan records are never shared between schools.',
    },
    {
      icon: <Smartphone className="w-6 h-6 text-orange-600" />,
      bg: 'bg-orange-50',
      title: 'Works on Any Device',
      desc: 'Runs in the browser — no app to install. Works on phones, tablets, and computers. Scanning uses the rear camera.',
    },
    {
      icon: <FileText className="w-6 h-6 text-red-600" />,
      bg: 'bg-red-50',
      title: 'PDF Card Printing',
      desc: 'Print individual or bulk meal cards as PDFs. Cards include student name, admission number, due date, and QR code.',
    },
    {
      icon: <Clock className="w-6 h-6 text-yellow-600" />,
      bg: 'bg-yellow-50',
      title: 'Renewal & Grace Periods',
      desc: 'Renew cards with one click. Expired cards show a warning — a configurable grace period prevents disruption.',
    },
  ];

  return (
    <section id="features" className="py-20 bg-white px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Everything your school needs</h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">Built specifically for Kenyan schools managing student meal payments.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(f => (
            <div key={f.title} className="bg-gray-50 rounded-2xl p-6 hover:shadow-md transition">
              <div className={`${f.bg} w-12 h-12 rounded-xl flex items-center justify-center mb-4`}>{f.icon}</div>
              <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: '1', title: 'Contact us to register', desc: 'Send us your school name. We create your account and send you login credentials within the hour.' },
    { n: '2', title: 'Log student payments', desc: 'Admin logs each student\'s meal payment. The system calculates the due date and generates a unique QR card.' },
    { n: '3', title: 'Print & distribute cards', desc: 'Print meal cards as PDFs — one per student or all at once. Students carry their card to the dining hall.' },
    { n: '4', title: 'Scan at the dining hall', desc: 'Teacher on duty scans the QR code with a phone. Green = valid meal. Red = expired. Logged automatically.' },
  ];
  return (
    <section id="how-it-works" className="py-20 bg-indigo-50 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Up and running in minutes</h2>
          <p className="text-gray-500 text-lg">No installation. No IT department needed.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(s => (
            <div key={s.n} className="bg-white rounded-2xl p-6 shadow-sm relative">
              <div className="w-10 h-10 bg-indigo-600 text-white font-black text-lg rounded-full flex items-center justify-center mb-4">{s.n}</div>
              <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────
function Pricing() {
  const plans = [
    {
      name: 'Basic',
      price: 'KSh 10,000',
      period: '/term',
      desc: 'Perfect for small primary schools',
      students: 'Up to 200 students',
      color: 'border-gray-200',
      btn: 'bg-gray-800 hover:bg-gray-900',
      features: ['Unlimited meal cards', 'QR code scanning', 'PDF card printing', 'Basic reports', 'Admin + Teacher login'],
    },
    {
      name: 'Standard',
      price: 'KSh 15,000',
      period: '/term',
      desc: 'For growing schools',
      students: 'Up to 600 students',
      color: 'border-indigo-500 ring-2 ring-indigo-500',
      btn: 'bg-indigo-600 hover:bg-indigo-700',
      badge: 'Most Popular',
      features: ['Everything in Basic', 'Detailed scan history', 'Daily attendance reports', 'Card renewal tracking', 'Priority support'],
    },
    {
      name: 'Premium',
      price: 'KSh 20,000',
      period: '/term',
      desc: 'For large institutions',
      students: 'Unlimited students',
      color: 'border-gray-200',
      btn: 'bg-purple-600 hover:bg-purple-700',
      features: ['Everything in Standard', 'Unlimited students', 'Full PDF export reports', 'Custom grace periods', 'Dedicated support'],
    },
  ];

  return (
    <section id="pricing" className="py-20 bg-white px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Simple, honest pricing</h2>
          <p className="text-gray-500 text-lg">All plans include a free 30-day trial. No credit card required.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {plans.map(p => (
            <div key={p.name} className={`rounded-2xl border-2 ${p.color} p-8 relative`}>
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">{p.badge}</div>
              )}
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{p.name}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-black text-gray-900">{p.price}</span>
                <span className="text-gray-400 mb-1">{p.period}</span>
              </div>
              <p className="text-sm text-gray-500 mb-1">{p.desc}</p>
              <p className="text-xs font-bold text-indigo-600 mb-6">{p.students}</p>
              <ul className="space-y-3 mb-8">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <a href="#contact" className={`block w-full ${p.btn} text-white font-bold py-3 rounded-xl text-center transition`}>
                Start Free Trial
              </a>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-gray-400 mt-8">
          Pay via M-Pesa or bank transfer. Invoices available on request.
        </p>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────
function Testimonials() {
  const quotes = [
    { quote: 'We used to spend 30 minutes every morning checking meal registers. Now the teacher just scans cards — takes 2 seconds per student.', name: 'Head Teacher', school: 'Primary School, Kisumu' },
    { quote: 'The PDF reports have made it so easy to account for every shilling collected. Parents trust us more now.', name: 'School Bursar', school: 'Academy, Nairobi' },
    { quote: 'Setting it up took less than an hour. The super admin created our account and we were logging payments the same day.', name: 'School Administrator', school: 'Secondary School, Mombasa' },
  ];
  return (
    <section className="py-20 bg-gray-50 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Schools love it</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {quotes.map((q, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 text-yellow-400 fill-yellow-400" />)}
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">"{q.quote}"</p>
              <div>
                <p className="font-bold text-gray-900 text-sm">{q.name}</p>
                <p className="text-xs text-gray-400">{q.school}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Contact / Sign Up ────────────────────────────────────────
function Contact() {
  const [form, setForm] = useState({ schoolName: '', name: '', phone: '', email: '', plan: 'standard', message: '' });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong. Please try again.'); return; }
      setSent(true);
    } catch {
      setError('Could not reach the server. Please try again or contact us directly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contact" className="py-20 bg-indigo-600 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">Get started today</h2>
          <p className="text-indigo-200 text-lg">Fill in the form and we'll set up your school account within the hour.</p>
        </div>

        {sent ? (
          <div className="bg-white rounded-2xl p-10 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-2xl font-black text-gray-900 mb-2">Request sent!</h3>
            <p className="text-gray-500">We'll contact you shortly to set up your school account.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">School Name *</label>
                  <input required value={form.schoolName} onChange={e => setForm({ ...form, schoolName: e.target.value })}
                    placeholder="e.g. Kosawo Primary School"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Your Name *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Head teacher / Administrator"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number *</label>
                  <input required type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="07XX XXX XXX"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="school@example.com"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Plan you're interested in</label>
                <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="basic">Basic — KSh 5,000/term (up to 200 students)</option>
                  <option value="standard">Standard — KSh 7,500/term (up to 600 students)</option>
                  <option value="premium">Premium — KSh 10,000/term (unlimited students)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Anything else?</label>
                <textarea rows={3} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                  placeholder="Number of students, questions, special requirements..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl text-lg transition flex items-center justify-center gap-2">
                {loading ? 'Sending…' : <> Send Request <ArrowRight className="w-5 h-5" /> </>}
              </button>
              {error && <p className="text-sm text-red-600 font-medium text-center">{error}</p>}
              <p className="text-xs text-gray-400 text-center">
                We'll set up your account and send credentials within 1 hour during business hours.
              </p>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                <CreditCard className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-black text-lg">ShuleMeal Cards</span>
            </div>
            <p className="text-sm max-w-xs leading-relaxed">Digital meal card management for Kenyan schools. Simple, secure, and affordable.</p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm">
            <div>
              <p className="text-white font-bold mb-3">Product</p>
              <ul className="space-y-2">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition">How it works</a></li>
              </ul>
            </div>
            <div>
              <p className="text-white font-bold mb-3">Account</p>
              <ul className="space-y-2">
                <li><a href="/app" className="hover:text-white transition">Sign In</a></li>
                <li><a href="#contact" className="hover:text-white transition">Get Started</a></li>
                <li><a href="#contact" className="hover:text-white transition">Contact Us</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs">
          <p>© {new Date().getFullYear()} ShuleMeal Cards. All rights reserved.</p>
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3" /> <span>Secure · School data is private and isolated</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── CTA Banner ───────────────────────────────────────────────
function CTABanner() {
  return (
    <section className="py-16 bg-gradient-to-r from-indigo-600 to-purple-600 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-black text-white mb-4">Ready to modernise your school's meal system?</h2>
        <p className="text-indigo-200 mb-8">Join schools already using ShuleMeal Cards. Start your free 30-day trial today.</p>
        <a href="#contact"
          className="inline-flex items-center gap-2 bg-white text-indigo-700 font-black px-8 py-4 rounded-xl text-lg hover:bg-indigo-50 transition shadow-lg">
          Get Started Free <ArrowRight className="w-5 h-5" />
        </a>
      </div>
    </section>
  );
}

// ─── Main Landing Page ────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen font-sans">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <CTABanner />
      <Contact />
      <Footer />
    </div>
  );
}
