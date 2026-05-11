import Papa from "papaparse";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  CreditCard,
  Users,
  Search,
  PlusCircle,
  Calendar,
  CheckCircle2,
  FileText,
  Printer,
  ShieldCheck,
  X,
  LogOut,
  Lock,
  Scan,
  CheckCircle,
  AlertCircle,
  BarChart2,
  Download,
  BookOpen,
  UserCheck,
  School,
  Trash2,
  PencilLine,
  Plus,
} from "lucide-react";
import { jsPDF } from "jspdf";
import jsQR from "jsqr";

// ─── Shared date helper — always compare from start of today ──
function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Custom Tooltip ───────────────────────────────────────────
function Tooltip({ text, color = "gray", children }) {
  const colors = {
    gray: "bg-gray-900 text-white",
    indigo: "bg-indigo-600 text-white",
    green: "bg-green-600 text-white",
    orange: "bg-orange-500 text-white",
    amber: "bg-amber-500 text-white",
    cyan: "bg-cyan-500 text-white",
    red: "bg-red-600 text-white",
  };
  return (
    <div className="relative group inline-flex">
      {children}
      <div
        className={`
          pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shadow-lg
          opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0
          transition-all duration-150 z-50
          ${colors[color] || colors.gray}
        `}
      >
        {text}
        {/* Arrow */}
        <span
          className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent ${
            color === "indigo"
              ? "border-t-indigo-600"
              : color === "green"
                ? "border-t-green-600"
                : color === "orange"
                  ? "border-t-orange-500"
                  : color === "amber"
                    ? "border-t-amber-500"
                    : color === "cyan"
                      ? "border-t-cyan-500"
                      : color === "red"
                        ? "border-t-red-600"
                        : "border-t-gray-900"
          }`}
        />
      </div>
    </div>
  );
}

// Parse a YYYY-MM-DD date string as local midnight (not UTC midnight)
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d); // local midnight
}

// ─── API helper ───────────────────────────────────────────────
function api(path, options = {}) {
  const token = localStorage.getItem("shulemeal_token");
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

// ─── Format UTC scanDate to local time ───────────────────────
function formatScanTime(scanDate) {
  if (!scanDate) return "-";
  const d = new Date(scanDate);
  if (isNaN(d)) return "-";
  const date = d.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} ${time}`;
}

// ─── Subscription UI helpers ──────────────────────────────────
const PLAN_LABELS = {
  trial: "Free Trial",
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
};
const PLAN_COLORS = {
  trial: "bg-blue-100 text-blue-800",
  basic: "bg-gray-100 text-gray-700",
  standard: "bg-indigo-100 text-indigo-800",
  premium: "bg-yellow-100 text-yellow-800",
};

function SubscriptionBanner({ subscription }) {
  if (!subscription) return null;
  const { state, daysLeft, expiry, graceEnd } = subscription;

  if (state === "trial") {
    if (daysLeft > 7) return null; // silent until 7 days left
    return (
      <div className="bg-blue-600 text-white text-sm px-4 py-2 flex items-center justify-between">
        <span>
          🎁 Free trial ends in{" "}
          <strong>
            {daysLeft} day{daysLeft !== 1 ? "s" : ""}
          </strong>{" "}
          ({expiry}). Contact your system provider to subscribe.
        </span>
      </div>
    );
  }
  if (state === "expiring_soon")
    return (
      <div className="bg-orange-500 text-white text-sm px-4 py-2 flex items-center justify-between">
        <span>
          ⚠️ Subscription expires in{" "}
          <strong>
            {daysLeft} day{daysLeft !== 1 ? "s" : ""}
          </strong>{" "}
          ({expiry}). Renew to avoid interruption.
        </span>
      </div>
    );
  if (state === "grace_period")
    return (
      <div className="bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-between">
        <span>
          🚨 Subscription expired on {expiry}.{" "}
          <strong>Grace period ends {graceEnd}</strong> — renew now to keep
          access.
        </span>
      </div>
    );
  return null;
}

function SubscriptionExpiredScreen({ state, expiry, onLogout }) {
  const messages = {
    trial_expired: {
      title: "Free Trial Ended",
      body: "Your 30-day free trial has expired. Subscribe to continue using ShuleMeal Cards.",
      icon: "🎁",
    },
    expired: {
      title: "Subscription Expired",
      body: `Your subscription expired on ${expiry}. Please renew to restore access.`,
      icon: "📅",
    },
    no_subscription: {
      title: "No Active Subscription",
      body: "This account does not have an active subscription.",
      icon: "🔒",
    },
  };
  const { title, body, icon } = messages[state] || messages["expired"];
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
        <div className="text-6xl mb-4">{icon}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-500 mb-8">{body}</p>
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 text-left mb-8">
          <p className="text-sm font-bold text-gray-700 mb-2">
            To renew your subscription:
          </p>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Contact your ShuleMeal system provider</li>
            <li>Make payment via M-Pesa or bank transfer</li>
            <li>Share your payment confirmation</li>
            <li>Access will be restored within minutes</li>
          </ol>
        </div>
        <button
          onClick={onLogout}
          className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2.5 rounded-lg transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [creds, setCreds] = useState({
    username: "",
    password: "",
    role: "admin",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      localStorage.setItem("shulemeal_token", data.token);
      onLogin(data);
    } catch {
      setError("Cannot reach server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-indigo-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-indigo-600 p-3 rounded-full mb-3">
            <CreditCard className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ShuleMeal Cards</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sign in to your school account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              value={creds.username}
              onChange={(e) => {
                setCreds({ ...creds, username: e.target.value });
                setError("");
              }}
              placeholder="School username"
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={creds.password}
              onChange={(e) => {
                setCreds({ ...creds, password: e.target.value });
                setError("");
              }}
              placeholder="Password"
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Sign in as
            </label>
            <div className="grid grid-cols-3 gap-2">
              {["admin", "teacher", "accountant"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setCreds({ ...creds, role: r })}
                  className={`py-2 rounded-lg text-sm font-bold border transition ${creds.role === r ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300"}`}
                >
                  {r === "admin"
                    ? "🛡 Admin"
                    : r === "teacher"
                      ? "📖 Teacher"
                      : "🧾 Accountant"}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-lg transition"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Super admin?{" "}
          <a href="/superadmin" className="text-indigo-500 underline">
            Go to super admin panel
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Super Admin Panel ────────────────────────────────────────
function SuperAdminPanel({ onBack }) {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(null);
  const tokenRef = useRef(null);
  const [error, setError] = useState("");
  const [schools, setSchools] = useState([]);
  const [signups, setSignups] = useState([]);
  const [activeSection, setActiveSection] = useState("schools"); // 'schools' | 'signups'
  const [form, setForm] = useState({
    name: "",
    username: "",
    adminPassword: "",
    teacherPassword: "",
    accountantPassword: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    adminPassword: "",
    teacherPassword: "",
    accountantPassword: "",
  });
  const [msg, setMsg] = useState("");

  const login = async (e) => {
    e.preventDefault();
    const res = await fetch("/api/superadmin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    tokenRef.current = data.token;
    setToken(data.token);
    loadSchools(data.token);
    loadSignups(data.token);
  };

  const saApi = (path, opts = {}) =>
    fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenRef.current}`,
        ...(opts.headers || {}),
      },
    });

  const loadSchools = (t) => {
    const tok = t || tokenRef.current;
    fetch("/api/superadmin/schools", {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSchools(data);
        else console.error("Schools load error:", data);
      })
      .catch((err) => console.error("Failed to load schools:", err));
  };

  const loadSignups = (t) => {
    const tok = t || tokenRef.current;
    fetch("/api/superadmin/signups", {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSignups(data);
      })
      .catch(() => {});
  };

  const createSchool = async (e) => {
    e.preventDefault();
    const res = await saApi("/api/superadmin/schools", {
      method: "POST",
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(`Error: ${data.error}`);
      return;
    }
    setMsg(`School "${data.name}" created successfully.`);
    setForm({
      name: "",
      username: "",
      adminPassword: "",
      teacherPassword: "",
      accountantPassword: "",
    });
    loadSchools();
  };

  const saveEdit = async (id) => {
    const res = await saApi(`/api/superadmin/schools/${id}`, {
      method: "PUT",
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      const d = await res.json();
      setMsg(`Error: ${d.error}`);
      return;
    }
    // Update subscription separately if plan/months provided
    if (editForm.plan || editForm.months) {
      await saApi(`/api/superadmin/schools/${id}/subscription`, {
        method: "PUT",
        body: JSON.stringify({
          plan: editForm.plan,
          months: editForm.months ? parseInt(editForm.months) : undefined,
        }),
      });
    }
    setMsg("School updated.");
    setEditingId(null);
    loadSchools();
  };

  const deleteSchool = async (id, name) => {
    if (
      !window.confirm(
        `Delete "${name}" and ALL its data? This cannot be undone.`,
      )
    )
      return;
    await saApi(`/api/superadmin/schools/${id}`, { method: "DELETE" });
    setMsg(`"${name}" deleted.`);
    loadSchools();
  };

  const deleteSignup = async (id, schoolName) => {
    if (!window.confirm(`Remove the sign-up request from "${schoolName}"?`))
      return;
    const res = await saApi(`/api/superadmin/signups/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setSignups((prev) => prev.filter((s) => s.id !== id));
      setMsg(`Sign-up request from "${schoolName}" removed.`);
    }
  };

  if (!token)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="w-7 h-7 text-purple-600" />
            <h1 className="text-xl font-bold text-gray-900">Super Admin</h1>
          </div>
          <form onSubmit={login} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="Super admin password"
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg"
            >
              Login
            </button>
          </form>
          <button
            onClick={onBack}
            className="mt-4 text-sm text-gray-400 hover:text-gray-600 w-full text-center"
          >
            ← Back to school login
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-purple-700 text-white px-6 py-4 flex justify-between items-center shadow">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6" />
          <h1 className="text-xl font-bold">Super Admin — School Management</h1>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 bg-purple-800 hover:bg-purple-900 px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <LogOut className="w-4 h-4" /> Exit
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {msg && (
          <div
            className={`border rounded-lg px-4 py-3 text-sm font-medium flex justify-between ${msg.startsWith("Error:") ? "bg-red-50 border-red-200 text-red-800" : "bg-green-50 border-green-200 text-green-800"}`}
          >
            {msg}{" "}
            <button onClick={() => setMsg("")}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Section tabs */}
        <div className="flex gap-2">
          {[
            ["schools", "Schools"],
            [
              "signups",
              `Sign-up Requests ${signups.length > 0 ? `(${signups.length})` : ""}`,
            ],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeSection === key ? "bg-purple-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-purple-300"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Create school */}
        {activeSection === "schools" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-purple-600" /> Add New School
            </h2>{" "}
            <form
              onSubmit={createSchool}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="School name"
                required
                className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
              />
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Username (letters, numbers, _ only)"
                required
                className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500">
                  🛡
                </span>
                <input
                  type="password"
                  value={form.adminPassword}
                  onChange={(e) =>
                    setForm({ ...form, adminPassword: e.target.value })
                  }
                  placeholder="Admin password (8+ chars, A-Z, 0-9, symbol)"
                  required
                  className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-teal-500">
                  📖
                </span>
                <input
                  type="password"
                  value={form.teacherPassword}
                  onChange={(e) =>
                    setForm({ ...form, teacherPassword: e.target.value })
                  }
                  placeholder="Teacher password (8+ chars, A-Z, 0-9, symbol)"
                  required
                  className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-500">
                  🧾
                </span>
                <input
                  type="password"
                  value={form.accountantPassword}
                  onChange={(e) =>
                    setForm({ ...form, accountantPassword: e.target.value })
                  }
                  placeholder="Accountant password (optional, 8+ chars, A-Z, 0-9, symbol)"
                  className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="sm:col-span-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg transition"
              >
                Create School Account
              </button>
            </form>
          </div>
        )}

        {/* Schools list */}
        {activeSection === "schools" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <School className="w-5 h-5 text-purple-600" /> Registered
                Schools ({schools.length})
              </h2>
            </div>
            {schools.length === 0 ? (
              <p className="p-8 text-center text-gray-400">
                No schools registered yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                      <th className="py-3 px-4 font-semibold">School</th>
                      <th className="py-3 px-4 font-semibold">Username</th>
                      <th className="py-3 px-4 font-semibold">Plan</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Expiry</th>
                      <th className="py-3 px-4 font-semibold text-center">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schools.map((s) => {
                      const sub = s.subscription || {};
                      const stateColors = {
                        active: "bg-green-100 text-green-700",
                        trial: "bg-blue-100 text-blue-700",
                        expiring_soon: "bg-orange-100 text-orange-700",
                        grace_period: "bg-red-100 text-red-700",
                        expired: "bg-red-200 text-red-800",
                        trial_expired: "bg-gray-200 text-gray-700",
                        no_subscription: "bg-gray-200 text-gray-700",
                      };
                      return (
                        <tr
                          key={s.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-3 px-4 font-bold text-gray-900">
                            {editingId === s.id ? (
                              <input
                                value={editForm.name}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    name: e.target.value,
                                  })
                                }
                                className="px-2 py-1 border border-purple-300 rounded text-sm w-full"
                              />
                            ) : (
                              s.name
                            )}
                          </td>
                          <td className="py-3 px-4 text-gray-600 font-mono text-sm">
                            {s.username}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold ${PLAN_COLORS[s.plan] || "bg-gray-100 text-gray-600"}`}
                            >
                              {PLAN_LABELS[s.plan] || s.plan}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold ${stateColors[sub.state] || "bg-gray-100 text-gray-600"}`}
                            >
                              {sub.state?.replace("_", " ").toUpperCase()}
                            </span>
                            {sub.daysLeft > 0 && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({sub.daysLeft}d)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {sub.expiry ||
                              (s.plan === "trial"
                                ? `Trial: ${s.trialEndsAt}`
                                : "—")}
                          </td>
                          <td className="py-3 px-4">
                            {editingId === s.id ? (
                              <div className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                  <input
                                    type="password"
                                    value={editForm.adminPassword}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        adminPassword: e.target.value,
                                      })
                                    }
                                    placeholder="🛡 Admin pwd"
                                    className="px-2 py-1 border border-gray-200 rounded text-xs w-28"
                                  />
                                  <input
                                    type="password"
                                    value={editForm.teacherPassword}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        teacherPassword: e.target.value,
                                      })
                                    }
                                    placeholder="📖 Teacher pwd"
                                    className="px-2 py-1 border border-gray-200 rounded text-xs w-28"
                                  />
                                  <input
                                    type="password"
                                    value={editForm.accountantPassword}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        accountantPassword: e.target.value,
                                      })
                                    }
                                    placeholder="🧾 Accountant pwd"
                                    className="px-2 py-1 border border-gray-200 rounded text-xs w-28"
                                  />
                                </div>
                                <div className="flex gap-2 items-center">
                                  <select
                                    value={editForm.plan}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        plan: e.target.value,
                                      })
                                    }
                                    className="px-2 py-1 border border-gray-200 rounded text-xs"
                                  >
                                    <option value="trial">Trial</option>
                                    <option value="basic">Basic</option>
                                    <option value="standard">Standard</option>
                                    <option value="premium">Premium</option>
                                  </select>
                                  <input
                                    type="number"
                                    min="1"
                                    max="24"
                                    value={editForm.months}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        months: e.target.value,
                                      })
                                    }
                                    placeholder="Months"
                                    className="px-2 py-1 border border-gray-200 rounded text-xs w-20"
                                  />
                                  <span className="text-xs text-gray-400">
                                    months
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveEdit(s.id)}
                                    className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="px-3 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingId(s.id);
                                    setEditForm({
                                      name: s.name,
                                      adminPassword: "",
                                      teacherPassword: "",
                                      accountantPassword: "",
                                      plan: s.plan || "trial",
                                      months: "1",
                                    });
                                  }}
                                  className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
                                  title="Edit / Renew"
                                >
                                  <PencilLine className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteSchool(s.id, s.name)}
                                  className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Sign-up requests */}
        {activeSection === "signups" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-600" /> Sign-up Requests (
                {signups.length})
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Schools that submitted the sign-up form on the landing page.
              </p>
            </div>
            {signups.length === 0 ? (
              <p className="p-8 text-center text-gray-400">
                No sign-up requests yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                      <th className="py-3 px-4 font-semibold">School</th>
                      <th className="py-3 px-4 font-semibold">Contact</th>
                      <th className="py-3 px-4 font-semibold">Phone</th>
                      <th className="py-3 px-4 font-semibold">Email</th>
                      <th className="py-3 px-4 font-semibold">Plan</th>
                      <th className="py-3 px-4 font-semibold">Date</th>
                      <th className="py-3 px-4 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signups.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {s.schoolName}
                        </td>
                        <td className="py-3 px-4 text-gray-700">{s.name}</td>
                        <td className="py-3 px-4 text-gray-600 font-mono text-sm">
                          {s.phone}
                        </td>
                        <td className="py-3 px-4 text-gray-600 text-sm">
                          {s.email || "—"}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${PLAN_COLORS[s.plan] || "bg-gray-100 text-gray-600"}`}
                          >
                            {PLAN_LABELS[s.plan] || s.plan}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {s.createdAt?.slice(0, 10)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setActiveSection("schools");
                                setForm((f) => ({ ...f, name: s.schoolName }));
                                setMsg(
                                  `Pre-filled school name from ${s.schoolName}'s signup. Set username and passwords to complete.`,
                                );
                              }}
                              className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded hover:bg-purple-700 transition"
                            >
                              Create Account
                            </button>
                            <button
                              onClick={() => deleteSignup(s.id, s.schoolName)}
                              className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition"
                              title="Remove request"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── QR Scanner ───────────────────────────────────────────────
function QRScannerTab() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const frameCountRef = useRef(0);
  const processingRef = useRef(false); // prevent double-scan
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false); // show instant feedback
  const [error, setError] = useState(null);
  const [mealType, setMealType] = useState("lunch");

  const MEAL_LABELS = { tea: "Tea Break", lunch: "Lunch", supper: "Supper" };
  const MEAL_ICONS = { tea: "☕", lunch: "🍽️", supper: "🌙" };

  const startCamera = async () => {
    setError(null);
    setScanResult(null);
    setVerifying(false);
    processingRef.current = false;
    frameCountRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      setScanning(true);
    } catch {
      setError(
        "Camera access denied. Please allow camera permission and try again.",
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setScanning(false);
  };

  useEffect(() => {
    if (!scanning) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    // willReadFrequently: true — tells browser to optimise for repeated getImageData calls
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (processingRef.current) return; // already found a code, stop looping
      rafRef.current = requestAnimationFrame(tick);

      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

      // Only run jsQR every 3rd frame (~20fps) — reduces CPU load significantly
      frameCountRef.current++;
      if (frameCountRef.current % 3 !== 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const code = jsQR(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
        { inversionAttempts: "dontInvert" }, // faster — skip inverted QR attempt
      );

      if (code) {
        processingRef.current = true;
        cancelAnimationFrame(rafRef.current);
        stopCamera();
        verifyCard(code.data);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scanning]);

  useEffect(() => () => stopCamera(), []);

  const verifyCard = async (text) => {
    try {
      const payload = JSON.parse(text);
      if (!payload.token) throw new Error("Invalid QR");

      // Show instant "verifying" state so the screen changes immediately
      setVerifying(true);

      const res = await api("/api/scan", {
        method: "POST",
        body: JSON.stringify({ token: payload.token, mealType }),
      });
      const data = await res.json();
      setVerifying(false);
      setScanResult(data);
    } catch {
      setVerifying(false);
      setScanResult({
        valid: false,
        message: "Invalid QR code — not a ShuleMeal card.",
        student: null,
      });
    }
  };

  return (
    <div className="flex flex-col items-center p-6 w-full max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
        <Scan className="text-indigo-600" /> Dining Hall Scanner
      </h2>

      {/* Meal type selector — always visible */}
      <div className="w-full mb-5">
        <p className="text-sm font-semibold text-gray-600 mb-2 text-center">
          Select Meal Period
        </p>
        <div className="grid grid-cols-3 gap-2">
          {["tea", "lunch", "supper"].map((m) => (
            <button
              key={m}
              onClick={() => setMealType(m)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 font-bold text-sm transition ${
                mealType === m
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-md"
                  : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
              }`}
            >
              <span className="text-xl">{MEAL_ICONS[m]}</span>
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Instant verifying state — shows immediately when QR is detected */}
      {verifying && (
        <div className="w-full p-10 rounded-2xl shadow-sm border border-indigo-200 bg-indigo-50 text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
          <p className="text-lg font-bold text-indigo-700">Verifying card…</p>
          <p className="text-sm text-indigo-500">{MEAL_LABELS[mealType]}</p>
        </div>
      )}

      {!scanResult && !verifying && (
        <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col items-center gap-4">
          <div
            className="relative w-full rounded-xl overflow-hidden bg-black"
            style={{ minHeight: "280px" }}
          >
            <video
              ref={videoRef}
              className="w-full rounded-xl"
              playsInline
              muted
              style={{ display: scanning ? "block" : "none" }}
            />
            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Scan className="w-16 h-16 text-gray-600 opacity-30" />
              </div>
            )}
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-4 border-indigo-400 rounded-xl opacity-70" />
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          {error && (
            <p className="text-red-600 text-sm font-medium text-center">
              {error}
            </p>
          )}
          {!scanning ? (
            <button
              onClick={startCamera}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition"
            >
              <Scan className="w-5 h-5" /> Scan for {MEAL_LABELS[mealType]}
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="w-full flex items-center justify-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl transition"
            >
              Stop Camera
            </button>
          )}
          <p className="text-xs text-gray-400 text-center">
            Point the rear camera at the QR code on the meal card.
          </p>
        </div>
      )}
      {scanResult && (
        <div
          className={`w-full p-8 rounded-2xl shadow-sm border text-center ${
            scanResult.valid
              ? "bg-green-50 border-green-200"
              : scanResult.duplicate
                ? "bg-orange-50 border-orange-300"
                : "bg-red-50 border-red-200"
          }`}
        >
          {scanResult.valid ? (
            <div className="flex flex-col items-center">
              <CheckCircle className="w-20 h-20 text-green-500 mb-4" />
              <div className="mb-2 inline-flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-bold">
                <span>{MEAL_ICONS[scanResult.mealType || mealType]}</span>
                {MEAL_LABELS[scanResult.mealType || mealType]}
              </div>
              <h3 className="text-2xl font-bold text-green-800 mb-2">
                APPROVED
              </h3>
              <p className="text-green-700 text-lg font-semibold">
                {scanResult.student?.studentName}
              </p>
              <p className="text-green-600 text-sm">
                ADM: {scanResult.student?.adm}
              </p>
              <p className="text-green-600 text-sm mt-1">
                {scanResult.message}
              </p>
            </div>
          ) : scanResult.duplicate ? (
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-4">
                <span className="text-4xl">🚫</span>
              </div>
              <div className="mb-2 inline-flex items-center gap-2 bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-bold">
                <span>{MEAL_ICONS[scanResult.mealType || mealType]}</span>
                {MEAL_LABELS[scanResult.mealType || mealType]}
              </div>
              <h3 className="text-2xl font-bold text-orange-800 mb-2">
                ALREADY SERVED
              </h3>
              <p className="text-orange-700 font-semibold text-lg">
                {scanResult.student?.studentName}
              </p>
              <p className="text-orange-600 text-sm">
                ADM: {scanResult.student?.adm}
              </p>
              <p className="text-orange-600 text-sm mt-2 font-medium">
                {scanResult.message}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <AlertCircle className="w-20 h-20 text-red-500 mb-4" />
              <h3 className="text-2xl font-bold text-red-800 mb-2">
                INVALID / EXPIRED
              </h3>
              <p className="text-red-700 font-medium">{scanResult.message}</p>
              {scanResult.student && (
                <p className="text-red-600 text-sm mt-1">
                  {scanResult.student.studentName}
                </p>
              )}
            </div>
          )}
          <button
            onClick={() => {
              setScanResult(null);
              startCamera();
            }}
            className={`mt-8 px-8 py-3 rounded-lg font-bold text-white transition ${
              scanResult.valid
                ? "bg-green-600 hover:bg-green-700"
                : scanResult.duplicate
                  ? "bg-orange-500 hover:bg-orange-600"
                  : "bg-red-600 hover:bg-red-700"
            }`}
          >
            Scan Next Student
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Reports Tab ──────────────────────────────────────────────
function ReportsTab({ transactions }) {
  const [scanSummary, setScanSummary] = useState([]);
  const [detailedScans, setDetailedScans] = useState([]);
  const [studentBreakdown, setStudentBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [activePanel, setActivePanel] = useState(null);

  const today = todayStart();
  const activeCards = transactions.filter(
    (tx) => parseLocalDate(tx.dueDate) >= today,
  );
  const expiredCards = transactions.filter(
    (tx) => parseLocalDate(tx.dueDate) < today,
  );
  const totalCollected = transactions.reduce((s, tx) => s + tx.amount, 0);

  useEffect(() => {
    Promise.all([
      api("/api/scans/summary").then((r) => r.json()),
      api("/api/scans/detailed").then((r) => r.json()),
      api("/api/scans/student-breakdown").then((r) => r.json()),
    ])
      .then(([summary, detailed, breakdown]) => {
        setScanSummary(Array.isArray(summary) ? summary : []);
        setDetailedScans(Array.isArray(detailed) ? detailed : []);
        setStudentBreakdown(Array.isArray(breakdown) ? breakdown : []);
        if (summary.length > 0) setSelectedDate(summary[0].date);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Group scans for selected date by student, showing which meals they had
  const scansForDate = detailedScans.filter((s) =>
    s.scanDate?.startsWith(selectedDate),
  );
  const studentScansForDate = scansForDate.reduce((acc, s) => {
    const key = s.adm;
    if (!acc[key])
      acc[key] = {
        studentName: s.studentName,
        adm: s.adm,
        grade: s.grade,
        meals: {},
        doubleDips: {},
      };
    if (s.status === "APPROVED") acc[key].meals[s.mealType] = true;
    if (s.status === "DUPLICATE") acc[key].doubleDips[s.mealType] = true;
    // Capture student name even if only duplicate scans exist
    if (s.studentName && !acc[key].studentName)
      acc[key].studentName = s.studentName;
    return acc;
  }, {});
  const studentScanRows = Object.values(studentScansForDate);

  const panelData = {
    all: { title: "All Students", rows: transactions },
    active: { title: "Active Cards", rows: activeCards },
    expired: { title: "Expired Cards", rows: expiredCards },
  };

  const exportPDF = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const now = new Date().toLocaleString();
    doc.setFillColor(55, 48, 163);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("ShuleMeal Cards — Management Report", 105, 12, {
      align: "center",
    });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${now}`, 105, 22, { align: "center" });
    const boxes = [
      {
        label: "Total Students",
        value: transactions.length,
        color: [219, 234, 254],
      },
      {
        label: "Active Cards",
        value: activeCards.length,
        color: [220, 252, 231],
      },
      {
        label: "Expired Cards",
        value: expiredCards.length,
        color: [254, 226, 226],
      },
      {
        label: "Total Collected",
        value: `KSh ${totalCollected.toLocaleString()}`,
        color: [254, 249, 195],
      },
    ];
    boxes.forEach((b, i) => {
      const x = 14 + (i % 2) * 96,
        y = 36 + Math.floor(i / 2) * 22;
      doc.setFillColor(...b.color);
      doc.roundedRect(x, y, 90, 16, 2, 2, "F");
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(b.label, x + 5, y + 6);
      doc.setFontSize(12);
      doc.text(String(b.value), x + 5, y + 13);
    });
    let y = 84;
    const renderTable = (title, rows, cols) => {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(title, 14, y);
      y += 6;
      doc.setFillColor(55, 48, 163);
      doc.rect(14, y, 182, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      cols.forEach((c) => doc.text(c.label, c.x, y + 5.5));
      y += 8;
      rows.forEach((row, i) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.setFillColor(
          i % 2 === 0 ? 248 : 255,
          i % 2 === 0 ? 248 : 255,
          i % 2 === 0 ? 248 : 255,
        );
        doc.rect(14, y, 182, 7, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        cols.forEach((c) => {
          doc.setTextColor(...(c.color ? c.color(row) : [30, 30, 30]));
          doc.text(String(c.val(row)), c.x, y + 5);
        });
        y += 7;
      });
    };
    renderTable("All Students", transactions, [
      { label: "Name", x: 18, val: (r) => r.studentName },
      { label: "Adm No.", x: 75, val: (r) => r.adm },
      { label: "Grade/Stream", x: 110, val: (r) => r.grade || "—" },
      { label: "Due Date", x: 155, val: (r) => r.dueDate },
      {
        label: "Status",
        x: 183,
        val: (r) => (parseLocalDate(r.dueDate) >= today ? "ACTIVE" : "EXPIRED"),
        color: (r) =>
          parseLocalDate(r.dueDate) >= today ? [22, 163, 74] : [220, 38, 38],
      },
    ]);
    doc.addPage();
    y = 20;
    renderTable("Detailed Scan Records", detailedScans, [
      { label: "Date & Time", x: 18, val: (s) => formatScanTime(s.scanDate) },
      { label: "Student Name", x: 70, val: (s) => s.studentName || "Unknown" },
      { label: "Adm No.", x: 120, val: (s) => s.adm || "-" },
      { label: "Grade/Stream", x: 148, val: (s) => s.grade || "—" },
      {
        label: "Status",
        x: 183,
        val: (s) => s.status,
        color: (s) => (s.status === "APPROVED" ? [22, 163, 74] : [220, 38, 38]),
      },
    ]);
    doc.addPage();
    y = 20;
    renderTable("Student Meal Breakdown (All Time)", studentBreakdown, [
      { label: "Student Name", x: 18, val: (s) => s.studentName || "Unknown" },
      { label: "Adm No.", x: 75, val: (s) => s.adm || "-" },
      { label: "Grade/Stream", x: 110, val: (s) => s.grade || "—" },
      {
        label: "Tea",
        x: 148,
        val: (s) => String(s.tea || 0),
        color: () => [2, 132, 199],
      },
      {
        label: "Lunch",
        x: 163,
        val: (s) => String(s.lunch || 0),
        color: () => [234, 88, 12],
      },
      {
        label: "Supper",
        x: 178,
        val: (s) => String(s.supper || 0),
        color: () => [79, 70, 229],
      },
      { label: "Total", x: 193, val: (s) => String(s.totalMeals || 0) },
    ]);
    doc.save("shulemeal-report.pdf");
  };

  // ── CSV helper ──────────────────────────────────────────────
  const downloadCSV = (filename, headers, rows) => {
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  // ── Per-date breakdown exports ───────────────────────────────
  const exportDateBreakdownCSV = () => {
    if (!selectedDate || studentScanRows.length === 0) return;
    const headers = [
      "Student Name",
      "Adm No.",
      "Grade/Stream",
      "Tea Break",
      "Lunch",
      "Supper",
      "Double-dip Tea",
      "Double-dip Lunch",
      "Double-dip Supper",
    ];
    const rows = studentScanRows.map((s) =>
      [
        `"${s.studentName || "Unknown"}"`,
        s.adm,
        `"${s.grade || ""}"`,
        s.meals.tea ? "Yes" : "No",
        s.meals.lunch ? "Yes" : "No",
        s.meals.supper ? "Yes" : "No",
        s.doubleDips.tea ? "Yes" : "No",
        s.doubleDips.lunch ? "Yes" : "No",
        s.doubleDips.supper ? "Yes" : "No",
      ].join(","),
    );
    downloadCSV(`meal-breakdown-${selectedDate}.csv`, headers, rows);
  };

  const exportDateBreakdownPDF = () => {
    if (!selectedDate || studentScanRows.length === 0) return;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    doc.setFillColor(55, 48, 163);
    doc.rect(0, 0, 210, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`Meal Breakdown - ${selectedDate}`, 105, 10, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${studentScanRows.length} students  |  Generated: ${new Date().toLocaleString()}`,
      105,
      18,
      { align: "center" },
    );
    let y = 30;
    const cols = [
      { label: "Student Name", x: 14 },
      { label: "Adm No.", x: 70 },
      { label: "Grade", x: 93 },
      { label: "Tea Break", x: 124 },
      { label: "Lunch", x: 148 },
      { label: "Supper", x: 170 },
    ];
    // Header row
    doc.setFillColor(55, 48, 163);
    doc.rect(14, y, 182, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    cols.forEach((c) => doc.text(c.label, c.x, y + 5.5));
    y += 8;
    studentScanRows.forEach((s, i) => {
      if (y > 272) {
        doc.addPage();
        y = 14;
      }
      doc.setFillColor(
        i % 2 === 0 ? 248 : 255,
        i % 2 === 0 ? 248 : 255,
        i % 2 === 0 ? 248 : 255,
      );
      doc.rect(14, y, 182, 7, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 30, 30);
      doc.text(s.studentName || "Unknown", 14, y + 5);
      doc.text(s.adm, 70, y + 5);
      doc.text(s.grade || "-", 93, y + 5);
      const cell = (served, dip, x) => {
        if (served) {
          doc.setTextColor(22, 163, 74);
          doc.text("Served", x, y + 5);
        } else if (dip) {
          doc.setTextColor(234, 88, 12);
          doc.text("Double-dip", x, y + 5);
        } else {
          doc.setTextColor(180, 180, 180);
          doc.text("-", x, y + 5);
        }
        doc.setTextColor(30, 30, 30);
      };
      cell(s.meals.tea, s.doubleDips.tea, 124);
      cell(s.meals.lunch, s.doubleDips.lunch, 148);
      cell(s.meals.supper, s.doubleDips.supper, 170);
      y += 7;
    });
    doc.save(`meal-breakdown-${selectedDate}.pdf`);
  };

  // ── All-time breakdown exports ───────────────────────────────
  const exportAllTimeCSV = () => {
    if (studentBreakdown.length === 0) return;
    const headers = [
      "Student Name",
      "Adm No.",
      "Grade/Stream",
      "Tea",
      "Lunch",
      "Supper",
      "Total Meals",
    ];
    const rows = studentBreakdown.map((s) =>
      [
        `"${s.studentName}"`,
        s.adm,
        `"${s.grade || ""}"`,
        s.tea || 0,
        s.lunch || 0,
        s.supper || 0,
        s.totalMeals || 0,
      ].join(","),
    );
    downloadCSV("student-meal-breakdown-alltime.csv", headers, rows);
  };

  const exportAllTimePDF = () => {
    if (studentBreakdown.length === 0) return;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    doc.setFillColor(55, 48, 163);
    doc.rect(0, 0, 210, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Student Meal Breakdown - All Time", 105, 10, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${studentBreakdown.length} students  |  Generated: ${new Date().toLocaleString()}`,
      105,
      18,
      { align: "center" },
    );
    let y = 30;
    const cols = [
      { label: "Student Name", x: 14 },
      { label: "Adm No.", x: 72 },
      { label: "Grade/Stream", x: 100 },
      { label: "Tea", x: 140 },
      { label: "Lunch", x: 157 },
      { label: "Supper", x: 172 },
      { label: "Total", x: 190 },
    ];
    doc.setFillColor(55, 48, 163);
    doc.rect(14, y, 182, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    cols.forEach((c) => doc.text(c.label, c.x, y + 5.5));
    y += 8;
    studentBreakdown.forEach((s, i) => {
      if (y > 272) {
        doc.addPage();
        y = 14;
      }
      doc.setFillColor(
        i % 2 === 0 ? 248 : 255,
        i % 2 === 0 ? 248 : 255,
        i % 2 === 0 ? 248 : 255,
      );
      doc.rect(14, y, 182, 7, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 30, 30);
      doc.text(s.studentName || "-", 14, y + 5);
      doc.text(s.adm, 72, y + 5);
      doc.text(s.grade || "-", 100, y + 5);
      doc.setTextColor(2, 132, 199);
      doc.text(String(s.tea || 0), 140, y + 5);
      doc.setTextColor(234, 88, 12);
      doc.text(String(s.lunch || 0), 157, y + 5);
      doc.setTextColor(79, 70, 229);
      doc.text(String(s.supper || 0), 172, y + 5);
      doc.setTextColor(30, 30, 30);
      doc.text(String(s.totalMeals || 0), 190, y + 5);
      y += 7;
    });
    doc.save("student-meal-breakdown-alltime.pdf");
  };

  const summaryCards = [
    {
      key: "all",
      label: "Total Students",
      value: transactions.length,
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-800",
      sub: "text-blue-600",
    },
    {
      key: "active",
      label: "Active Cards",
      value: activeCards.length,
      bg: "bg-green-50",
      border: "border-green-200",
      text: "text-green-800",
      sub: "text-green-600",
    },
    {
      key: "expired",
      label: "Expired Cards",
      value: expiredCards.length,
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-800",
      sub: "text-red-600",
    },
    {
      key: null,
      label: "Total Collected",
      value: `KSh ${totalCollected.toLocaleString()}`,
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      text: "text-yellow-800",
      sub: "text-yellow-600",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BarChart2 className="text-indigo-600" /> Management Report
        </h2>
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-lg transition"
        >
          <Download className="w-4 h-4" /> Export PDF
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((card) => (
          <button
            key={card.key || "collected"}
            onClick={() =>
              card.key &&
              setActivePanel(activePanel === card.key ? null : card.key)
            }
            className={`${card.bg} border ${card.border} rounded-xl p-4 text-left transition ${card.key ? "hover:shadow-md cursor-pointer" : "cursor-default"} ${activePanel === card.key ? "ring-2 ring-offset-1 ring-indigo-400" : ""}`}
          >
            <p className={`text-xs ${card.sub} font-bold uppercase`}>
              {card.label}
            </p>
            <p className={`text-3xl font-black ${card.text} mt-1`}>
              {card.value}
            </p>
            {card.key && (
              <p className={`text-xs ${card.sub} mt-1`}>Click to view</p>
            )}
          </button>
        ))}
      </div>
      {activePanel && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">
              {panelData[activePanel].title} (
              {panelData[activePanel].rows.length})
            </h3>
            <button
              onClick={() => setActivePanel(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {panelData[activePanel].rows.length === 0 ? (
            <p className="p-6 text-center text-gray-400">
              No students in this category.
            </p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                  <th className="py-3 px-6 font-semibold">Student Name</th>
                  <th className="py-3 px-6 font-semibold">Adm No.</th>
                  <th className="py-3 px-6 font-semibold">Grade / Stream</th>
                  <th className="py-3 px-6 font-semibold">Due Date</th>
                  <th className="py-3 px-6 font-semibold">Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                {panelData[activePanel].rows.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-3 px-6 font-medium text-gray-800">
                      {tx.studentName}
                    </td>
                    <td className="py-3 px-6 text-gray-600">{tx.adm}</td>
                    <td className="py-3 px-6">
                      {tx.grade ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700">
                          {tx.grade}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-6">
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold ${parseLocalDate(tx.dueDate) >= today ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                      >
                        {tx.dueDate}
                      </span>
                    </td>
                    <td className="py-3 px-6 font-bold text-gray-700">
                      KSh {tx.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Daily Meal Scan History</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Click a date to see which students ate that day
          </p>
        </div>
        {loading ? (
          <p className="p-6 text-center text-gray-400">Loading...</p>
        ) : scanSummary.length === 0 ? (
          <p className="p-6 text-center text-gray-400">No scan records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                  <th className="py-3 px-6 font-semibold">Date</th>
                  <th className="py-3 px-6 font-semibold text-sky-600">
                    ☕ Tea
                  </th>
                  <th className="py-3 px-6 font-semibold text-orange-600">
                    🍽 Lunch
                  </th>
                  <th className="py-3 px-6 font-semibold text-indigo-600">
                    🌙 Supper
                  </th>
                  <th className="py-3 px-6 font-semibold text-green-700">
                    Total Approved
                  </th>
                  <th className="py-3 px-6 font-semibold text-red-600">
                    Rejected
                  </th>
                  <th className="py-3 px-6 font-semibold text-orange-600">
                    Double-dips
                  </th>
                </tr>
              </thead>
              <tbody>
                {scanSummary.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() =>
                      setSelectedDate(selectedDate === row.date ? "" : row.date)
                    }
                    className={`border-b border-gray-100 cursor-pointer transition ${selectedDate === row.date ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                  >
                    <td className="py-3 px-6 font-medium text-indigo-700 underline">
                      {row.date}
                    </td>
                    <td className="py-3 px-6 font-bold text-sky-600">
                      {row.tea || 0}
                    </td>
                    <td className="py-3 px-6 font-bold text-orange-600">
                      {row.lunch || 0}
                    </td>
                    <td className="py-3 px-6 font-bold text-indigo-600">
                      {row.supper || 0}
                    </td>
                    <td className="py-3 px-6 font-bold text-green-600">
                      {row.approved}
                    </td>
                    <td className="py-3 px-6 font-bold text-red-500">
                      {row.rejected}
                    </td>
                    <td className="py-3 px-6 font-bold text-orange-500">
                      {row.duplicates || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-date student meal breakdown */}
      {selectedDate && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">
              Meal breakdown for {selectedDate} — {studentScanRows.length}{" "}
              student{studentScanRows.length !== 1 ? "s" : ""}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={exportDateBreakdownCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold rounded-lg transition"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={exportDateBreakdownPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition"
              >
                <FileText className="w-3.5 h-3.5" /> PDF
              </button>
              <button
                onClick={() => setSelectedDate("")}
                className="text-gray-400 hover:text-gray-600 ml-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {studentScanRows.length === 0 ? (
            <p className="p-6 text-center text-gray-400">
              No approved meals for this date.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                    <th className="py-3 px-6 font-semibold">Student Name</th>
                    <th className="py-3 px-6 font-semibold">Adm No.</th>
                    <th className="py-3 px-6 font-semibold">Grade / Stream</th>
                    <th className="py-3 px-6 font-semibold text-sky-600">
                      ☕ Tea Break
                    </th>
                    <th className="py-3 px-6 font-semibold text-orange-600">
                      🍽 Lunch
                    </th>
                    <th className="py-3 px-6 font-semibold text-indigo-600">
                      🌙 Supper
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentScanRows.map((s, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-3 px-6 font-medium text-gray-800">
                        {s.studentName || "Unknown"}
                      </td>
                      <td className="py-3 px-6 text-gray-600 font-mono text-sm">
                        {s.adm}
                      </td>
                      <td className="py-3 px-6">
                        {s.grade ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700">
                            {s.grade}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      {["tea", "lunch", "supper"].map((meal) => (
                        <td key={meal} className="py-3 px-6">
                          <div className="flex flex-col gap-1">
                            {s.meals[meal] && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                ✓ Served
                              </span>
                            )}
                            {s.doubleDips[meal] && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                                🚫 Double-dip
                              </span>
                            )}
                            {!s.meals[meal] && !s.doubleDips[meal] && (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* All-time per-student meal breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-gray-800">
              Student Meal Breakdown (All Time)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Total approved meals per student across all dates
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportAllTimeCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold rounded-lg transition"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={exportAllTimePDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition"
            >
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>
        {loading ? (
          <p className="p-6 text-center text-gray-400">Loading...</p>
        ) : studentBreakdown.length === 0 ? (
          <p className="p-6 text-center text-gray-400">No meal records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                  <th className="py-3 px-6 font-semibold">Student Name</th>
                  <th className="py-3 px-6 font-semibold">Adm No.</th>
                  <th className="py-3 px-6 font-semibold">Grade / Stream</th>
                  <th className="py-3 px-6 font-semibold text-sky-600">
                    ☕ Tea
                  </th>
                  <th className="py-3 px-6 font-semibold text-orange-600">
                    🍽 Lunch
                  </th>
                  <th className="py-3 px-6 font-semibold text-indigo-600">
                    🌙 Supper
                  </th>
                  <th className="py-3 px-6 font-semibold text-gray-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {studentBreakdown.map((s, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 0 ? "" : "bg-gray-50/40"}`}
                  >
                    <td className="py-3 px-6 font-medium text-gray-800">
                      {s.studentName}
                    </td>
                    <td className="py-3 px-6 text-gray-600 font-mono text-sm">
                      {s.adm}
                    </td>
                    <td className="py-3 px-6">
                      {s.grade ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700">
                          {s.grade}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-6 font-bold text-sky-600">
                      {s.tea || 0}
                    </td>
                    <td className="py-3 px-6 font-bold text-orange-600">
                      {s.lunch || 0}
                    </td>
                    <td className="py-3 px-6 font-bold text-indigo-600">
                      {s.supper || 0}
                    </td>
                    <td className="py-3 px-6 font-bold text-gray-700">
                      {s.totalMeals || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Teacher Dashboard ────────────────────────────────────────
function TeacherDashboard({
  transactions,
  schoolName,
  user,
  onLogout,
  subscription,
}) {
  const [activeTab, setActiveTab] = useState("scanner");
  const [query, setQuery] = useState("");
  const today = todayStart();
  const filtered =
    query.trim().length > 0
      ? transactions.filter(
          (tx) =>
            tx.studentName.toLowerCase().includes(query.toLowerCase()) ||
            tx.adm.toLowerCase().includes(query.toLowerCase()),
        )
      : [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SubscriptionBanner subscription={subscription} />
      <header className="bg-teal-600 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <BookOpen className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-bold leading-tight">
                ShuleMeal — Teacher Portal
              </h1>
              <p className="text-teal-200 text-xs">{schoolName}</p>
            </div>
          </div>
          <div className="flex bg-teal-700/50 p-1 rounded-lg">
            {[
              ["scanner", <Scan className="w-4 h-4" />, "QR Scanner"],
              ["lookup", <UserCheck className="w-4 h-4" />, "Student Lookup"],
            ].map(([tab, icon, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition ${activeTab === tab ? "bg-white text-teal-700 shadow" : "text-teal-100 hover:text-white hover:bg-teal-700/50"}`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-teal-700 px-3 py-1 rounded-full text-sm font-medium">
              {user}
            </span>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 px-3 py-1.5 rounded-lg text-sm font-medium transition"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 py-8">
        {activeTab === "scanner" ? (
          <QRScannerTab transactions={transactions} />
        ) : (
          <div className="max-w-3xl mx-auto px-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <UserCheck className="text-teal-600 w-5 h-5" /> Student Meal
                Status Lookup
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by student name or admission number…"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>
            {query.trim().length > 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {filtered.length === 0 ? (
                  <p className="p-8 text-center text-gray-400">
                    No students found for "{query}".
                  </p>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                        <th className="py-3 px-5 font-semibold">Student</th>
                        <th className="py-3 px-5 font-semibold">Adm No.</th>
                        <th className="py-3 px-5 font-semibold">
                          Grade / Stream
                        </th>
                        <th className="py-3 px-5 font-semibold">Due Date</th>
                        <th className="py-3 px-5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((tx) => {
                        const isActive = parseLocalDate(tx.dueDate) >= today;
                        const daysLeft = Math.ceil(
                          (parseLocalDate(tx.dueDate) - today) /
                            (1000 * 60 * 60 * 24),
                        );
                        return (
                          <tr
                            key={tx.id}
                            className="border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="py-4 px-5 font-bold text-gray-900">
                              {tx.studentName}
                            </td>
                            <td className="py-4 px-5 text-gray-600">
                              {tx.adm}
                            </td>
                            <td className="py-4 px-5">
                              {tx.grade ? (
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700">
                                  {tx.grade}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-4 px-5 text-gray-600">
                              {tx.dueDate}
                            </td>
                            <td className="py-4 px-5">
                              {isActive ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                    <CheckCircle className="w-3 h-3" /> ACTIVE
                                  </span>
                                  {daysLeft <= 7 && (
                                    <p className="text-xs text-orange-500 font-medium mt-1">
                                      Expires in {daysLeft} day
                                      {daysLeft !== 1 ? "s" : ""}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                  <AlertCircle className="w-3 h-3" /> EXPIRED
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">
                  Type a name or admission number to look up a student.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Students Tab (grouped by grade/stream) ───────────────────
function StudentsTab({ transactions }) {
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("all");

  // Collect unique grades, sort them; students with no grade go under "Unassigned"
  const gradeLabel = (g) => g || "Unassigned";

  const filtered = transactions.filter((tx) => {
    const q = search.toLowerCase();
    return (
      tx.studentName.toLowerCase().includes(q) ||
      tx.adm.toLowerCase().includes(q) ||
      (tx.grade || "").toLowerCase().includes(q)
    );
  });

  const allGrades = [
    ...new Set(transactions.map((tx) => gradeLabel(tx.grade))),
  ].sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  const gradesToShow =
    selectedGrade === "all"
      ? allGrades
      : allGrades.filter((g) => g === selectedGrade);

  const grouped = gradesToShow.reduce((acc, grade) => {
    acc[grade] = filtered.filter((tx) => gradeLabel(tx.grade) === grade);
    return acc;
  }, {});

  const today = todayStart();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" /> Student Database
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {transactions.length} student{transactions.length !== 1 ? "s" : ""}{" "}
            across {allGrades.length} class{allGrades.length !== 1 ? "es" : ""}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or ADM…"
              className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none w-56"
            />
          </div>
          {/* Grade filter */}
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="all">All Classes</option>
            {allGrades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No students logged yet.</p>
          <p className="text-sm mt-1">
            Log a payment to add students to the database.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {gradesToShow.map((grade) => {
            const students = grouped[grade];
            if (!students || students.length === 0) return null;
            const activeCount = students.filter(
              (tx) => parseLocalDate(tx.dueDate) >= today,
            ).length;
            return (
              <div
                key={grade}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                {/* Grade header */}
                <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 text-white rounded-lg px-3 py-1 text-sm font-bold">
                      {grade}
                    </div>
                    <span className="text-sm text-gray-600 font-medium">
                      {students.length} student
                      {students.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-green-700 font-semibold">
                      <CheckCircle className="w-4 h-4" /> {activeCount} active
                    </span>
                    <span className="flex items-center gap-1 text-red-600 font-semibold">
                      <AlertCircle className="w-4 h-4" />{" "}
                      {students.length - activeCount} expired
                    </span>
                  </div>
                </div>
                {/* Students table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                        <th className="py-3 px-6 font-semibold">
                          Student Name
                        </th>
                        <th className="py-3 px-6 font-semibold">ADM No.</th>
                        <th className="py-3 px-6 font-semibold">Amount Paid</th>
                        <th className="py-3 px-6 font-semibold">Paid On</th>
                        <th className="py-3 px-6 font-semibold">Due Date</th>
                        <th className="py-3 px-6 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((tx) => {
                        const isActive = parseLocalDate(tx.dueDate) >= today;
                        const daysLeft = Math.ceil(
                          (parseLocalDate(tx.dueDate) - today) /
                            (1000 * 60 * 60 * 24),
                        );
                        return (
                          <tr
                            key={tx.id}
                            className="border-b border-gray-50 hover:bg-gray-50 transition"
                          >
                            <td className="py-3 px-6 font-semibold text-gray-900">
                              {tx.studentName}
                            </td>
                            <td className="py-3 px-6 text-gray-500 text-sm font-mono">
                              {tx.adm}
                            </td>
                            <td className="py-3 px-6 text-gray-700 font-bold">
                              KSh {tx.amount.toLocaleString()}
                            </td>
                            <td className="py-3 px-6 text-gray-500 text-sm">
                              {tx.paidDate || "—"}
                            </td>
                            <td className="py-3 px-6 text-sm font-medium text-gray-700">
                              {tx.dueDate}
                            </td>
                            <td className="py-3 px-6">
                              {isActive ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                    <CheckCircle className="w-3 h-3" /> ACTIVE
                                  </span>
                                  {daysLeft <= 7 && daysLeft >= 0 && (
                                    <p className="text-xs text-orange-500 font-medium mt-1">
                                      Expires in {daysLeft} day
                                      {daysLeft !== 1 ? "s" : ""}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                  <AlertCircle className="w-3 h-3" /> EXPIRED
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Accountant Dashboard ─────────────────────────────────────
function AccountantDashboard({ schoolName, user, onLogout, subscription }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [defaulters, setDefaulters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mealCostPerHead, setMealCostPerHead] = useState(50);

  // Attendance
  const [attendanceDates, setAttendanceDates] = useState([]);
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState("");
  const [attendanceStudents, setAttendanceStudents] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Top-up form
  const [topupForm, setTopupForm] = useState({
    adm: "",
    amount: "",
    dueDate: "",
    paymentMode: "Cash",
    mpesaRef: "",
  });
  const [topupMsg, setTopupMsg] = useState(null);
  const [topupResult, setTopupResult] = useState(null);

  // Refund form
  const [refundForm, setRefundForm] = useState({
    adm: "",
    amount: "",
    reason: "",
  });
  const [refundMsg, setRefundMsg] = useState(null);

  const today = new Date().toISOString().split("T")[0];

  const loadAttendanceStudents = (date) => {
    if (!date) return;
    setAttendanceLoading(true);
    api(`/api/accountant/meal-attendance?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        setAttendanceStudents(Array.isArray(data) ? data : []);
        setAttendanceLoading(false);
      })
      .catch(() => setAttendanceLoading(false));
  };

  const handleAttendanceDateChange = (date) => {
    setSelectedAttendanceDate(date);
  };

  // Auto-fetch students whenever selected date changes
  useEffect(() => {
    if (selectedAttendanceDate) loadAttendanceStudents(selectedAttendanceDate);
  }, [selectedAttendanceDate]);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api("/api/accountant/summary").then((r) => r.json()),
      api(
        `/api/accountant/payments${dateFrom || dateTo ? `?from=${dateFrom}&to=${dateTo}` : ""}`,
      ).then((r) => r.json()),
      api("/api/accountant/defaulters").then((r) => r.json()),
      api("/api/accountant/meal-attendance").then((r) => r.json()),
    ])
      .then(([s, p, d, a]) => {
        setSummary(s);
        setPayments(Array.isArray(p) ? p : []);
        setDefaulters(Array.isArray(d) ? d : []);
        const dates = Array.isArray(a) ? a : [];
        setAttendanceDates(dates);
        // Always prefer today's date; fall back to most recent date
        const todayEntry = dates.find((row) => row.date === today);
        const targetDate = todayEntry ? today : dates[0]?.date || "";
        // Setting this triggers the useEffect above to fetch students
        if (targetDate) setSelectedAttendanceDate(targetDate);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const handleExportAttendanceCSV = () => {
    if (!selectedAttendanceDate) return;
    const token = localStorage.getItem("shulemeal_token");
    fetch(
      `/api/accountant/meal-attendance/export-csv?date=${selectedAttendanceDate}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `attendance-${selectedAttendanceDate}.csv`;
        a.click();
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTopup = async (e) => {
    e.preventDefault();
    setTopupMsg(null);
    setTopupResult(null);
    const res = await api("/api/accountant/topup", {
      method: "POST",
      body: JSON.stringify({
        ...topupForm,
        amount: parseFloat(topupForm.amount),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTopupMsg({ type: "error", text: data.error || "Top-up failed" });
      return;
    }
    setTopupResult(data);
    setTopupMsg({
      type: "success",
      text: `Card extended for ${data.studentName} until ${data.dueDate}`,
    });
    setTopupForm({
      adm: "",
      amount: "",
      dueDate: "",
      paymentMode: "Cash",
      mpesaRef: "",
    });
    loadData();
  };

  const handleRefund = async (e) => {
    e.preventDefault();
    setRefundMsg(null);
    const res = await api("/api/accountant/refund", {
      method: "POST",
      body: JSON.stringify({
        ...refundForm,
        amount: parseFloat(refundForm.amount),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRefundMsg({ type: "error", text: data.error || "Refund failed" });
      return;
    }
    setRefundMsg({ type: "success", text: "Refund recorded successfully." });
    setRefundForm({ adm: "", amount: "", reason: "" });
    loadData();
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    const token = localStorage.getItem("shulemeal_token");
    const url = `/api/accountant/export-csv?${params.toString()}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "payments-export.csv";
        a.click();
      });
  };

  const generateReceipt = (tx) => {
    const { jsPDF } = window.jspdf || {};
    // Use the globally available jsPDF from the import at the top of App.jsx
    import("jspdf").then(({ jsPDF }) => {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a5",
      });
      const W = 148,
        pad = 14;
      // Header
      doc.setFillColor(55, 48, 163);
      doc.rect(0, 0, W, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("PAYMENT RECEIPT", W / 2, 12, { align: "center" });
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(schoolName || "ShuleMeal School", W / 2, 20, {
        align: "center",
      });
      // Body
      doc.setTextColor(30, 30, 30);
      let y = 38;
      const row = (label, value, bold = false) => {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.text(label, pad, y);
        doc.setFontSize(10);
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setTextColor(17, 24, 39);
        doc.text(String(value), pad + 45, y);
        y += 9;
      };
      row("Receipt No.", `RCP-${String(tx.id).padStart(6, "0")}`);
      row("Date", tx.paidDate || today);
      row("Student Name", tx.studentName, true);
      row("Admission No.", tx.adm);
      if (tx.grade) row("Class / Grade", tx.grade);
      row("Amount Paid", `KSh ${Math.abs(tx.amount).toLocaleString()}`, true);
      row("Payment Mode", tx.paymentMode || "Cash");
      if (tx.mpesaRef) row("M-Pesa Ref", tx.mpesaRef);
      row("Valid Until", tx.dueDate);
      // Divider
      y += 2;
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.3);
      doc.line(pad, y, W - pad, y);
      y += 8;
      // Footer
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(107, 114, 128);
      doc.text(
        "Thank you for your payment. This is an official receipt.",
        W / 2,
        y,
        { align: "center" },
      );
      y += 6;
      doc.text("ShuleMeal Cards — Powered by ShuleMeal", W / 2, y, {
        align: "center",
      });
      doc.save(`receipt-${tx.adm}-${tx.paidDate || today}.pdf`);
    });
  };

  const whatsappMessage = (tx) => {
    const days = Math.ceil(
      (new Date(today) - new Date(tx.dueDate)) / (1000 * 60 * 60 * 24),
    );
    const msg = `Dear Parent, ${tx.studentName}'s ShuleMeal card expired on ${tx.dueDate} (${days} day${days !== 1 ? "s" : ""} ago). Please top up to reactivate their meal plan. Contact the school bursar for payment details.`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  const TABS = [
    ["dashboard", "📊", "Dashboard"],
    ["attendance", "🍽", "Attendance"],
    ["payments", "💳", "Payments"],
    ["defaulters", "⚠️", "Defaulters"],
    ["refund", "↩️", "Refund"],
  ];

  const inputCls =
    "w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none text-sm";
  const labelCls = "block text-sm font-semibold text-gray-700 mb-1";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SubscriptionBanner subscription={subscription} />
      <header className="bg-emerald-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧾</span>
            <div>
              <h1 className="text-xl font-bold">Accountant Portal</h1>
              <p className="text-emerald-200 text-xs">{schoolName}</p>
            </div>
          </div>
          <div className="flex bg-emerald-800/50 p-1 rounded-lg flex-wrap gap-1">
            {TABS.map(([key, icon, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold transition ${activeTab === key ? "bg-white text-emerald-700 shadow" : "text-emerald-100 hover:text-white hover:bg-emerald-700/50"}`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-emerald-800 px-3 py-1 rounded-full text-sm font-medium">
              {user}
            </span>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 px-3 py-1.5 rounded-lg text-sm font-medium transition"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                Financial Dashboard
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500 font-medium">
                  Meal cost/head (KSh)
                </label>
                <input
                  type="number"
                  value={mealCostPerHead}
                  onChange={(e) => setMealCostPerHead(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            {loading ? (
              <p className="text-gray-400 text-center py-12">Loading…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    {
                      label: "Total Revenue",
                      value: `KSh ${(summary?.totalRevenue || 0).toLocaleString()}`,
                      color:
                        "bg-emerald-50 border-emerald-200 text-emerald-800",
                      sub: "text-emerald-600",
                    },
                    {
                      label: "Today's Inflow",
                      value: `KSh ${(summary?.todayRevenue || 0).toLocaleString()}`,
                      color: "bg-blue-50 border-blue-200 text-blue-800",
                      sub: "text-blue-600",
                    },
                    {
                      label: "Active Cards",
                      value: summary?.activeCards || 0,
                      color: "bg-green-50 border-green-200 text-green-800",
                      sub: "text-green-600",
                    },
                    {
                      label: "Defaulters",
                      value: summary?.expiredCards || 0,
                      color: "bg-red-50 border-red-200 text-red-800",
                      sub: "text-red-600",
                    },
                    {
                      label: "Today's Meals",
                      value: summary?.todayMeals || 0,
                      color: "bg-orange-50 border-orange-200 text-orange-800",
                      sub: "text-orange-600",
                    },
                    {
                      label: "Meal Cost Today",
                      value: `KSh ${((summary?.todayMeals || 0) * mealCostPerHead).toLocaleString()}`,
                      color: "bg-purple-50 border-purple-200 text-purple-800",
                      sub: "text-purple-600",
                    },
                  ].map((c, i) => (
                    <div key={i} className={`${c.color} border rounded-xl p-4`}>
                      <p className={`text-xs font-bold uppercase ${c.sub}`}>
                        {c.label}
                      </p>
                      <p className="text-2xl font-black mt-1">{c.value}</p>
                    </div>
                  ))}
                </div>
                {/* Daily reconciliation */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    📋 Today's Reconciliation — {today}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {["Cash", "M-Pesa", "Bank Deposit", "Cheque"].map(
                      (mode) => {
                        const modeTotal = payments
                          .filter(
                            (p) =>
                              p.paidDate === today &&
                              p.paymentMode === mode &&
                              p.amount > 0,
                          )
                          .reduce((s, p) => s + p.amount, 0);
                        return (
                          <div
                            key={mode}
                            className="bg-gray-50 rounded-lg p-4 border border-gray-100"
                          >
                            <p className="text-xs text-gray-500 font-bold uppercase">
                              {mode}
                            </p>
                            <p className="text-xl font-black text-gray-800 mt-1">
                              KSh {modeTotal.toLocaleString()}
                            </p>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ATTENDANCE TAB ── */}
        {activeTab === "attendance" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Meal Attendance
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Students served per day — Tea Break, Lunch & Supper
                </p>
              </div>
              <button
                onClick={() => {
                  // Reload date list then re-fetch students for selected date
                  api("/api/accountant/meal-attendance")
                    .then((r) => r.json())
                    .then((a) => {
                      const dates = Array.isArray(a) ? a : [];
                      setAttendanceDates(dates);
                      const todayEntry = dates.find(
                        (row) => row.date === today,
                      );
                      const target = todayEntry
                        ? today
                        : dates[0]?.date || selectedAttendanceDate;
                      if (target)
                        setSelectedAttendanceDate((prev) => {
                          // Force re-trigger useEffect even if same date
                          if (prev === target) {
                            loadAttendanceStudents(target);
                            return prev;
                          }
                          return target;
                        });
                    });
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition"
              >
                ↻ Refresh
              </button>
            </div>

            {/* Date summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {attendanceDates.length === 0 && !loading ? (
                <p className="col-span-4 text-center text-gray-400 py-10">
                  No meal scan records yet.
                </p>
              ) : (
                attendanceDates.map((row) => (
                  <button
                    key={row.date}
                    onClick={() => handleAttendanceDateChange(row.date)}
                    className={`text-left p-4 rounded-xl border transition ${selectedAttendanceDate === row.date ? "bg-emerald-600 border-emerald-600 text-white shadow-md" : "bg-white border-gray-200 hover:border-emerald-400 hover:shadow-sm"}`}
                  >
                    <p
                      className={`text-xs font-bold uppercase mb-1 ${selectedAttendanceDate === row.date ? "text-emerald-100" : "text-gray-500"}`}
                    >
                      {row.date === today ? `Today — ${row.date}` : row.date}
                    </p>
                    <p
                      className={`text-2xl font-black ${selectedAttendanceDate === row.date ? "text-white" : "text-gray-800"}`}
                    >
                      {row.studentCount}
                    </p>
                    <p
                      className={`text-xs mt-1 ${selectedAttendanceDate === row.date ? "text-emerald-100" : "text-gray-400"}`}
                    >
                      students
                    </p>
                    <div
                      className={`flex gap-2 mt-2 text-xs font-semibold ${selectedAttendanceDate === row.date ? "text-emerald-100" : "text-gray-500"}`}
                    >
                      <span>☕ {row.tea || 0}</span>
                      <span>🍽 {row.lunch || 0}</span>
                      <span>🌙 {row.supper || 0}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Student list for selected date */}
            {selectedAttendanceDate && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-gray-800">
                      {selectedAttendanceDate === today
                        ? "Today's"
                        : selectedAttendanceDate}{" "}
                      Attendance
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {attendanceStudents.length} student
                      {attendanceStudents.length !== 1 ? "s" : ""} served
                      {attendanceStudents.length > 0 && (
                        <>
                          {" "}
                          · ☕ {attendanceStudents.filter((s) => s.tea).length}
                          &nbsp;· 🍽{" "}
                          {attendanceStudents.filter((s) => s.lunch).length}
                          &nbsp;· 🌙{" "}
                          {attendanceStudents.filter((s) => s.supper).length}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={handleExportAttendanceCSV}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold rounded-lg transition"
                  >
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                </div>
                {attendanceLoading ? (
                  <p className="p-8 text-center text-gray-400">
                    Loading students…
                  </p>
                ) : attendanceStudents.length === 0 ? (
                  <p className="p-8 text-center text-gray-400">
                    No students found for this date.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider border-b border-gray-200">
                          <th className="py-3 px-5 font-semibold">#</th>
                          <th className="py-3 px-5 font-semibold">
                            Student Name
                          </th>
                          <th className="py-3 px-5 font-semibold">Adm No.</th>
                          <th className="py-3 px-5 font-semibold">
                            Grade / Stream
                          </th>
                          <th className="py-3 px-5 font-semibold text-sky-600">
                            ☕ Tea
                          </th>
                          <th className="py-3 px-5 font-semibold text-orange-600">
                            🍽 Lunch
                          </th>
                          <th className="py-3 px-5 font-semibold text-indigo-600">
                            🌙 Supper
                          </th>
                          <th className="py-3 px-5 font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceStudents.map((s, i) => (
                          <tr
                            key={s.adm}
                            className={`border-b border-gray-50 hover:bg-gray-50 ${i % 2 === 0 ? "" : "bg-gray-50/40"}`}
                          >
                            <td className="py-3 px-5 text-gray-400 text-sm">
                              {i + 1}
                            </td>
                            <td className="py-3 px-5 font-semibold text-gray-800">
                              {s.studentName}
                            </td>
                            <td className="py-3 px-5 text-gray-500 font-mono text-sm">
                              {s.adm}
                            </td>
                            <td className="py-3 px-5">
                              {s.grade ? (
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700">
                                  {s.grade}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-5">
                              {s.tea ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700">
                                  ✓
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 px-5">
                              {s.lunch ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                                  ✓
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 px-5">
                              {s.supper ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                                  ✓
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 px-5 font-bold text-gray-700">
                              {s.totalMeals}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {activeTab === "payments" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                Payment Records
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <button
                  onClick={loadData}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition"
                >
                  Filter
                </button>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold rounded-lg transition"
                >
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider border-b border-gray-200">
                      <th className="py-3 px-5 font-semibold">Student</th>
                      <th className="py-3 px-5 font-semibold">Grade</th>
                      <th className="py-3 px-5 font-semibold">Amount</th>
                      <th className="py-3 px-5 font-semibold">Paid On</th>
                      <th className="py-3 px-5 font-semibold">Due Date</th>
                      <th className="py-3 px-5 font-semibold">Mode</th>
                      <th className="py-3 px-5 font-semibold">Ref</th>
                      <th className="py-3 px-5 font-semibold">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr>
                        <td
                          colSpan="8"
                          className="py-10 text-center text-gray-400"
                        >
                          No payment records found.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p, i) => (
                        <tr
                          key={p.id}
                          className={`border-b border-gray-50 hover:bg-gray-50 ${p.amount < 0 ? "bg-red-50/40" : ""}`}
                        >
                          <td className="py-3 px-5">
                            <p className="font-semibold text-gray-800 text-sm">
                              {p.studentName}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">
                              {p.adm}
                            </p>
                          </td>
                          <td className="py-3 px-5 text-sm text-gray-600">
                            {p.grade || "—"}
                          </td>
                          <td
                            className={`py-3 px-5 font-bold text-sm ${p.amount < 0 ? "text-red-600" : "text-gray-800"}`}
                          >
                            {p.amount < 0 ? "−" : ""}KSh{" "}
                            {Math.abs(p.amount).toLocaleString()}
                            {p.amount < 0 && (
                              <span className="ml-1 text-xs font-normal text-red-500">
                                Refund
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-5 text-sm text-gray-600">
                            {p.paidDate}
                          </td>
                          <td className="py-3 px-5 text-sm text-gray-600">
                            {p.dueDate}
                          </td>
                          <td className="py-3 px-5">
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-700">
                              {p.paymentMode || "Cash"}
                            </span>
                          </td>
                          <td className="py-3 px-5 text-xs text-gray-500 font-mono">
                            {p.mpesaRef || "—"}
                          </td>
                          <td className="py-3 px-5">
                            {p.amount > 0 && (
                              <button
                                onClick={() => generateReceipt(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg transition"
                              >
                                <Printer className="w-3.5 h-3.5" /> Receipt
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── DEFAULTERS TAB ── */}
        {activeTab === "defaulters" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">
              Defaulters & Arrears
            </h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {defaulters.length === 0 ? (
                <p className="p-10 text-center text-gray-400">
                  No defaulters — all cards are active! 🎉
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-red-50 text-gray-600 text-xs uppercase tracking-wider border-b border-red-100">
                        <th className="py-3 px-5 font-semibold">Student</th>
                        <th className="py-3 px-5 font-semibold">Grade</th>
                        <th className="py-3 px-5 font-semibold">Expired On</th>
                        <th className="py-3 px-5 font-semibold">
                          Days Overdue
                        </th>
                        <th className="py-3 px-5 font-semibold">Last Amount</th>
                        <th className="py-3 px-5 font-semibold">Reminder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defaulters.map((tx, i) => {
                        const overdue = Math.ceil(
                          (new Date(today) - new Date(tx.dueDate)) /
                            (1000 * 60 * 60 * 24),
                        );
                        return (
                          <tr
                            key={tx.id}
                            className="border-b border-gray-50 hover:bg-red-50/30"
                          >
                            <td className="py-3 px-5">
                              <p className="font-semibold text-gray-800 text-sm">
                                {tx.studentName}
                              </p>
                              <p className="text-xs text-gray-400 font-mono">
                                {tx.adm}
                              </p>
                            </td>
                            <td className="py-3 px-5 text-sm text-gray-600">
                              {tx.grade || "—"}
                            </td>
                            <td className="py-3 px-5">
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                                {tx.dueDate}
                              </span>
                            </td>
                            <td className="py-3 px-5 font-bold text-red-600 text-sm">
                              {overdue} day{overdue !== 1 ? "s" : ""}
                            </td>
                            <td className="py-3 px-5 font-bold text-gray-700 text-sm">
                              KSh {tx.amount?.toLocaleString()}
                            </td>
                            <td className="py-3 px-5">
                              <a
                                href={whatsappMessage(tx)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition"
                              >
                                💬 WhatsApp
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TOP-UP TAB ── */}
        {activeTab === "topup" && (
          <div className="max-w-lg mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Extend Card / Top-Up
            </h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <form onSubmit={handleTopup} className="space-y-4">
                <div>
                  <label className={labelCls}>Admission Number</label>
                  <input
                    type="text"
                    value={topupForm.adm}
                    onChange={(e) =>
                      setTopupForm((p) => ({ ...p, adm: e.target.value }))
                    }
                    placeholder="e.g. 4501"
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Amount Paid (KSh)</label>
                  <input
                    type="number"
                    value={topupForm.amount}
                    onChange={(e) =>
                      setTopupForm((p) => ({ ...p, amount: e.target.value }))
                    }
                    placeholder="0.00"
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>New Due Date</label>
                  <input
                    type="date"
                    value={topupForm.dueDate}
                    onChange={(e) =>
                      setTopupForm((p) => ({ ...p, dueDate: e.target.value }))
                    }
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Payment Mode</label>
                  <select
                    value={topupForm.paymentMode}
                    onChange={(e) =>
                      setTopupForm((p) => ({
                        ...p,
                        paymentMode: e.target.value,
                      }))
                    }
                    className={inputCls}
                  >
                    {["Cash", "M-Pesa", "Bank Deposit", "Cheque"].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {topupForm.paymentMode === "M-Pesa" && (
                  <div>
                    <label className={labelCls}>M-Pesa Reference Code</label>
                    <input
                      type="text"
                      value={topupForm.mpesaRef}
                      onChange={(e) =>
                        setTopupForm((p) => ({
                          ...p,
                          mpesaRef: e.target.value,
                        }))
                      }
                      placeholder="e.g. SDF987XYS"
                      className={inputCls}
                    />
                  </div>
                )}
                {topupMsg && (
                  <div
                    className={`rounded-lg px-4 py-3 text-sm font-medium ${topupMsg.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}
                  >
                    {topupMsg.text}
                  </div>
                )}
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition"
                >
                  <CheckCircle2 className="w-5 h-5" /> Process Top-Up
                </button>
              </form>
              {topupResult && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => generateReceipt(topupResult)}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg transition"
                  >
                    <Printer className="w-4 h-4" /> Generate Receipt
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REFUND TAB ── */}
        {activeTab === "refund" && (
          <div className="max-w-lg mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Payment Reversal / Refund
            </h2>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <strong>Note:</strong> Refunds are recorded as negative
              transactions. The original payment is preserved in the audit
              trail.
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <form onSubmit={handleRefund} className="space-y-4">
                <div>
                  <label className={labelCls}>Admission Number</label>
                  <input
                    type="text"
                    value={refundForm.adm}
                    onChange={(e) =>
                      setRefundForm((p) => ({ ...p, adm: e.target.value }))
                    }
                    placeholder="e.g. 4501"
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Refund Amount (KSh)</label>
                  <input
                    type="number"
                    value={refundForm.amount}
                    onChange={(e) =>
                      setRefundForm((p) => ({ ...p, amount: e.target.value }))
                    }
                    placeholder="0.00"
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Reason for Refund</label>
                  <textarea
                    value={refundForm.reason}
                    onChange={(e) =>
                      setRefundForm((p) => ({ ...p, reason: e.target.value }))
                    }
                    placeholder="e.g. Student transferred to another school mid-term"
                    rows={3}
                    className={inputCls + " resize-none"}
                    required
                  />
                </div>
                {refundMsg && (
                  <div
                    className={`rounded-lg px-4 py-3 text-sm font-medium ${refundMsg.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}
                  >
                    {refundMsg.text}
                  </div>
                )}
                <button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition"
                >
                  ↩️ Record Refund
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Meal Card Visual ─────────────────────────────────────────
function MealCard({ tx, template, schoolName }) {
  const [qrSrc, setQrSrc] = useState(null);

  const primaryColor = template?.primaryColor || "#3730a3";
  const secondaryColor = template?.secondaryColor || "#4338ca";
  const backgroundColor = template?.backgroundColor || "#ffffff";
  const textColor = template?.textColor || "#111827";
  const borderRadius = template?.borderRadius || 6;
  const showSchoolName = template?.showSchoolName !== false;

  useEffect(() => {
    if (!tx.id) return;
    api(`/api/transactions/${tx.id}/qr`)
      .then((r) => r.json())
      .then((d) => {
        if (d.qr) setQrSrc(d.qr);
      })
      .catch(() => {});
  }, [tx.id]);

  const lbl = (text) => ({
    fontSize: "7px",
    fontWeight: "bold",
    textTransform: "uppercase",
    color: textColor,
    opacity: 0.55,
    margin: "0 0 1px",
    letterSpacing: "0.04em",
  });

  const val = (size = "11px", weight = 700) => ({
    fontSize: size,
    fontWeight: weight,
    color: textColor,
    margin: 0,
    lineHeight: 1.2,
  });

  return (
    <div
      style={{
        width: "3.5in",
        height: "2in",
        border: `2px solid ${primaryColor}`,
        backgroundColor,
        borderRadius: `${borderRadius}px`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          backgroundColor: primaryColor,
          padding: "5px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: "11px",
            letterSpacing: "0.08em",
          }}
        >
          SHULE MEAL CARD
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {tx.cardType === "pledge" && (
            <span
              style={{
                color: "#fcd34d",
                fontSize: "13px",
                fontWeight: "bold",
                lineHeight: 1,
              }}
              title="Pledge"
            >
              ◆
            </span>
          )}
          {tx.cardType === "special" && (
            <span
              style={{
                color: "#06b6d4",
                fontSize: "13px",
                fontWeight: "bold",
                lineHeight: 1,
              }}
              title="Special Case"
            >
              ★
            </span>
          )}
          {showSchoolName && (
            <span
              style={{
                color: "rgba(255,255,255,0.85)",
                fontSize: "8px",
                fontWeight: 600,
                maxWidth: "45%",
                textAlign: "right",
                lineHeight: 1.2,
              }}
            >
              {schoolName || tx.schoolName || ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Body: info left | QR right ── */}
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          padding: "6px 8px 4px",
          gap: "8px",
          minHeight: 0,
        }}
      >
        {/* Info column */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: 0,
          }}
        >
          {/* Student name */}
          <div>
            <p style={lbl()}>Student</p>
            <p style={val("12px", 800)}>{tx.studentName}</p>
          </div>

          {/* ADM + Grade in a row */}
          <div style={{ display: "flex", gap: "10px" }}>
            <div>
              <p style={lbl()}>Adm No.</p>
              <p style={val("10px")}>{tx.adm}</p>
            </div>
            {tx.grade && (
              <div>
                <p style={lbl()}>Class</p>
                <p style={val("10px")}>{tx.grade}</p>
              </div>
            )}
          </div>

          {/* Meal slots */}
          <div style={{ display: "flex", gap: "4px", marginTop: "auto" }}>
            {[
              ["☕", "Tea"],
              ["🍽", "Lunch"],
              ["🌙", "Supper"],
            ].map(([icon, label]) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  backgroundColor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "4px",
                  padding: "2px 2px 3px",
                }}
              >
                <span style={{ fontSize: "9px" }}>{icon}</span>
                <span
                  style={{
                    fontSize: "5.5px",
                    fontWeight: "bold",
                    color: "#166534",
                    textTransform: "uppercase",
                    marginBottom: "2px",
                  }}
                >
                  {label}
                </span>
                <div
                  style={{
                    width: "13px",
                    height: "13px",
                    border: "1.5px solid #16a34a",
                    borderRadius: "2px",
                    backgroundColor: "#fff",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div
          style={{ width: "1px", backgroundColor: "#e5e7eb", flexShrink: 0 }}
        />

        {/* QR + due date column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            width: "68px",
          }}
        >
          <div
            style={{
              padding: "3px",
              backgroundColor: "#fff",
              border: `1px solid ${secondaryColor}`,
              borderRadius: "5px",
            }}
          >
            <img src={qrSrc || ""} width="58" height="58" alt="QR Code" />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              color: secondaryColor,
            }}
          >
            <ShieldCheck style={{ width: "8px", height: "8px" }} />
            <span style={{ fontSize: "6px", fontWeight: "bold" }}>
              VERIFIED
            </span>
          </div>
          {/* Due date */}
          <div
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "4px",
              padding: "3px 4px",
              textAlign: "center",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <p
              style={{
                fontSize: "6px",
                color: "#dc2626",
                fontWeight: "bold",
                textTransform: "uppercase",
                margin: "0 0 1px",
              }}
            >
              Due Date
            </p>
            <p
              style={{
                fontSize: "9px",
                fontWeight: 900,
                color: "#b91c1c",
                margin: 0,
              }}
            >
              {tx.dueDate}
            </p>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          borderTop: "1px solid #f3f4f6",
          padding: "2px 8px",
          display: "flex",
          justifyContent: "flex-end",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "6px", color: "#9ca3af" }}>
          ID: {String(tx.id).slice(-6)} | {tx.paidDate}
        </span>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App({ superAdminMode = false }) {
  const [_hash, setHash] = useState("");
  const navigate = useNavigate();
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem("shulemeal_token");
    const meta = localStorage.getItem("shulemeal_meta");
    return token && meta ? JSON.parse(meta) : null;
  });
  const [activeTab, setActiveTab] = useState("admin");
  const [transactions, setTransactions] = useState([]);
  const [archivedTransactions, setArchivedTransactions] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [subscription, setSubscription] = useState(() => {
    const meta = localStorage.getItem("shulemeal_meta");
    return meta ? JSON.parse(meta).subscription || null : null;
  });
  const [form, setForm] = useState({
    studentName: "",
    adm: "",
    amount: "",
    durationWeeks: "4",
    durationDays: "30",
    durationType: "weeks",
    grade: "",
  });
  const [previewCard, setPreviewCard] = useState(null);
  const [renewingTx, setRenewingTx] = useState(null);
  const [renewForm, setRenewForm] = useState({
    amount: "",
    durationWeeks: "4",
  });
  const [cardTemplate, setCardTemplate] = useState(null);
  const [pledgeTx, setPledgeTx] = useState(null);
  const [pledgeForm, setPledgeForm] = useState({
    pledgeAmount: "",
    durationWeeks: "4",
  });
  const [specialTx, setSpecialTx] = useState(null);
  const [specialForm, setSpecialForm] = useState({ durationWeeks: "4" });
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Super admin panel via hash
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const fetchTransactions = async () => {
    try {
      const res = await api("/api/transactions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTransactions(data);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
    }
  };

  const fetchArchived = async () => {
    try {
      const res = await api("/api/transactions/archived");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setArchivedTransactions(data);
    } catch (error) {
      console.error("Failed to fetch archived:", error);
    }
  };

  useEffect(() => {
    if (session) fetchTransactions();
  }, [session]);

  // Refresh subscription status periodically
  useEffect(() => {
    if (!session) return;
    const check = () =>
      api("/api/subscription/status")
        .then((r) => r.json())
        .then((sub) => {
          setSubscription(sub);
          const meta = JSON.parse(
            localStorage.getItem("shulemeal_meta") || "{}",
          );
          localStorage.setItem(
            "shulemeal_meta",
            JSON.stringify({ ...meta, subscription: sub }),
          );
        })
        .catch(() => {});
    check();
    const interval = setInterval(check, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(interval);
  }, [session]);

  // Load card template on mount
  useEffect(() => {
    if (!session) return;
    api("/api/templates/default")
      .then((r) => r.json())
      .then((template) => setCardTemplate(template))
      .catch(console.error);
  }, [session]);

  const handleLogin = (data) => {
    const meta = {
      schoolName: data.schoolName,
      role: data.role,
      username: data.username || "",
      subscription: data.subscription,
    };
    localStorage.setItem("shulemeal_meta", JSON.stringify(meta));
    setSession(meta);
    setSubscription(data.subscription || null);
  };

  const handleLogout = () => {
    localStorage.removeItem("shulemeal_token");
    localStorage.removeItem("shulemeal_meta");
    setSession(null);
    setTransactions([]);
    window.location.hash = "";
  };

  const calculateDueDate = (weeks, days) => {
    const d = new Date();
    if (days !== undefined && days !== null && days !== "") {
      const n = parseInt(days);
      if (isNaN(n) || n < 1) return "—";
      d.setDate(d.getDate() + n);
    } else {
      const w = parseInt(weeks);
      if (isNaN(w) || w < 1) return "—";
      d.setDate(d.getDate() + w * 7);
    }
    return d.toISOString().split("T")[0];
  };

  const handleFormChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Archive this student record? They will be removed from the dashboard but all data is safely preserved and can be restored if needed.",
      )
    )
      return;
    const res = await api(`/api/transactions/${id}`, { method: "DELETE" });
    if (res.ok) setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    else alert("Archive failed.");
  };

  const handleRestore = async (id) => {
    const res = await api(`/api/transactions/${id}/restore`, {
      method: "POST",
    });
    if (!res.ok) {
      alert("Restore failed.");
      return;
    }
    // Remove from archived list and refresh active list
    setArchivedTransactions((prev) => prev.filter((tx) => tx.id !== id));
    fetchTransactions();
  };

  const handleReplaceCard = async (tx) => {
    if (
      !window.confirm(
        `Deactivate the current card for ${tx.studentName} and generate a new one?`,
      )
    )
      return;
    const res = await api(`/api/transactions/${tx.id}/replace`, {
      method: "POST",
    });
    const updated = await res.json();
    setTransactions((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t)),
    );
    setPreviewCard(updated);
  };

  const handleRenew = async (e) => {
    e.preventDefault();
    if (!renewForm.amount) return alert("Please enter the amount paid.");
    const base = new Date(Math.max(new Date(), new Date(renewingTx.dueDate)));
    base.setDate(base.getDate() + parseInt(renewForm.durationWeeks) * 7);
    const newDueDate = base.toISOString().split("T")[0];
    const res = await api(`/api/transactions/${renewingTx.id}`, {
      method: "PUT",
      body: JSON.stringify({
        dueDate: newDueDate,
        amount: parseFloat(renewForm.amount),
      }),
    });
    if (!res.ok) {
      alert("Failed to renew. Please try again.");
      return;
    }
    // Backend returns { ok: true } — update the local record directly
    const updated = {
      ...renewingTx,
      dueDate: newDueDate,
      amount: renewingTx.amount + parseFloat(renewForm.amount),
    };
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === renewingTx.id ? updated : tx)),
    );
    setRenewingTx(null);
    setRenewForm({ amount: "", durationWeeks: "4" });
  };

  const handlePledge = async (e) => {
    e.preventDefault();
    if (!pledgeForm.pledgeAmount)
      return alert("Please enter the pledged amount.");
    const dueDate = calculateDueDate(pledgeForm.durationWeeks);
    const res = await api(`/api/transactions/${pledgeTx.id}/cardtype`, {
      method: "PATCH",
      body: JSON.stringify({
        cardType: "pledge",
        pledgeAmount: parseFloat(pledgeForm.pledgeAmount),
        dueDate,
      }),
    });
    if (!res.ok) {
      alert("Failed to set pledge. Please try again.");
      return;
    }
    const updated = await res.json();
    setTransactions((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t)),
    );
    setPledgeTx(null);
    setPledgeForm({ pledgeAmount: "", durationWeeks: "4" });
    setPreviewCard(updated);
  };

  const handleSpecialCase = (tx) => {
    setSpecialTx(tx);
    setSpecialForm({ durationWeeks: "4" });
  };

  const handleSpecialCaseSubmit = async (e) => {
    e.preventDefault();
    const dueDate = calculateDueDate(specialForm.durationWeeks);
    const res = await api(`/api/transactions/${specialTx.id}/cardtype`, {
      method: "PATCH",
      body: JSON.stringify({ cardType: "special", dueDate }),
    });
    if (!res.ok) {
      alert("Failed to set special case. Please try again.");
      return;
    }
    const updated = await res.json();
    setTransactions((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t)),
    );
    setSpecialTx(null);
    setPreviewCard(updated);
  };

  const handleLogPayment = async (e) => {
    e.preventDefault();
    if (!form.studentName || !form.adm || !form.amount)
      return alert("Please fill all fields");
    if (
      form.durationType === "days" &&
      (!form.durationDays || parseInt(form.durationDays) < 1)
    )
      return alert("Please enter a valid number of days (minimum 1).");
    const duplicate = transactions.find((tx) => tx.adm === form.adm);
    if (duplicate)
      return alert(
        `Admission number ${form.adm} is already registered to ${duplicate.studentName}.`,
      );
    const payload = {
      studentName: form.studentName,
      adm: form.adm,
      amount: parseFloat(form.amount),
      paidDate: new Date().toISOString().split("T")[0],
      dueDate:
        form.durationType === "days"
          ? calculateDueDate(null, form.durationDays)
          : calculateDueDate(form.durationWeeks),
      status: "Active",
      grade: form.grade || null,
    };
    const res = await api("/api/transactions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      alert("Failed to save: " + (err.error || "Unknown error"));
      return;
    }
    const data = await res.json();
    // Build the full transaction object for the UI
    const saved = { ...payload, id: data.id, cardToken: data.cardToken };
    setTransactions((prev) => [saved, ...prev]);
    setForm({
      studentName: "",
      adm: "",
      amount: "",
      durationWeeks: "4",
      durationDays: "30",
      durationType: "weeks",
      grade: "",
    });
    setPreviewCard(saved);
  };

  const drawCard = (doc, tx, originX, originY, schoolName) => {
    const W = 88.9,
      H = 60;
    const infoX = originX + 4; // left info column x
    const qrX = originX + 58; // QR column x
    const qrW = W - 58 - 2; // QR column width

    // ── White background + border ──
    doc.setFillColor(255, 255, 255);
    doc.rect(originX, originY, W, H, "F");
    doc.setDrawColor(49, 46, 129);
    doc.setLineWidth(0.4);
    doc.rect(originX + 0.2, originY + 0.2, W - 0.4, H - 0.4);

    // ── Header bar ──
    doc.setFillColor(55, 48, 163);
    doc.rect(originX, originY, W, 11, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("SHULE MEAL CARD", originX + (qrX - originX) / 2, originY + 7, {
      align: "center",
    });
    // School name right-aligned in header
    if (schoolName) {
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.text(schoolName, originX + W - 3, originY + 7, { align: "right" });
    }
    // Card type symbol — drawn shapes (helvetica can't render Unicode symbols)
    // ◆ Pledge = amber filled rotated square (diamond)
    // ★ Special = purple filled 5-point star
    const symX = originX + W - (schoolName ? 20 : 5);
    const symY = originY + 5.5;
    if (tx.cardType === "pledge") {
      // Draw a diamond: rotated square using lines
      const s = 2.8; // half-size
      doc.setFillColor(252, 211, 77); // amber
      doc.setDrawColor(252, 211, 77);
      doc.lines(
        [
          [s, s],
          [s, -s],
          [-s, -s],
          [-s, s],
        ],
        symX,
        symY,
        [1, 1],
        "F",
        true,
      );
    } else if (tx.cardType === "special") {
      // Draw a 5-point star using lines
      const r1 = 3.2,
        r2 = 1.4; // outer and inner radius
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? r1 : r2;
        pts.push([Math.cos(angle) * r, Math.sin(angle) * r]);
      }
      // Convert to relative moves for doc.lines
      const moves = pts.map((p, i) => {
        const prev =
          i === 0 ? [symX, symY] : [symX + pts[i - 1][0], symY + pts[i - 1][1]];
        return [
          p[0] - (i === 0 ? 0 : pts[i - 1][0]),
          p[1] - (i === 0 ? 0 : pts[i - 1][1]),
        ];
      });
      doc.setFillColor(6, 182, 212); // cyan-500
      doc.setDrawColor(6, 182, 212);
      doc.lines(moves, symX + pts[0][0], symY + pts[0][1], [1, 1], "F", true);
    }

    // ── Vertical divider ──
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(qrX - 2, originY + 12, qrX - 2, originY + H - 5);

    // ── INFO COLUMN ──
    let y = originY + 17;

    // Student name
    doc.setFontSize(4.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text("STUDENT", infoX, y);
    y += 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(tx.studentName, infoX, y);
    y += 5;

    // ADM + Grade on same row
    doc.setFontSize(4.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text("ADM NO.", infoX, y);
    if (tx.grade) doc.text("CLASS / GRADE", infoX + 24, y);
    y += 3.5;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(tx.adm, infoX, y);
    if (tx.grade) doc.text(tx.grade, infoX + 24, y);
    y += 6;

    // ── Meal slots (Tea | Lunch | Supper) ──
    const slotW = 14,
      slotH = 11,
      slotGap = 1.5;
    ["Tea Break", "Lunch", "Supper"].forEach((label, i) => {
      const sx = infoX + i * (slotW + slotGap);
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
      doc.setLineWidth(0.3);
      doc.roundedRect(sx, y, slotW, slotH, 1, 1, "FD");
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(22, 101, 52);
      doc.text(label, sx + slotW / 2, y + 4, { align: "center" });
      // tick box
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(22, 163, 74);
      doc.setLineWidth(0.5);
      doc.rect(sx + slotW / 2 - 2.5, y + 5.5, 5, 4.5, "FD");
    });
    y += slotH + 2;

    // ── Due date box ──
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(254, 202, 202);
    doc.setLineWidth(0.3);
    doc.roundedRect(infoX, y, 46, 8, 1, 1, "FD");
    doc.setFontSize(4.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(220, 38, 38);
    doc.text("NEXT DUE DATE", infoX + 2, y + 3.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(185, 28, 28);
    doc.text(tx.dueDate, infoX + 2, y + 7);

    // ── QR COLUMN ──
    // QR image is added by the caller (handlePrint / handlePrintAll)
    // Verified badge placeholder
    doc.setFontSize(4.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(67, 56, 202);
    doc.text("✓ VERIFIED", qrX + qrW / 2, originY + H - 7, { align: "center" });

    // ── Footer ──
    doc.setFontSize(4);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(156, 163, 175);
    doc.text(
      `ID: ${String(tx.id).slice(-6)} | ${tx.paidDate}`,
      originX + W - 2,
      originY + H - 2,
      { align: "right" },
    );
  };

  const handlePrint = async (tx) => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [88.9, 60],
    });
    drawCard(doc, tx, 0, 0, session.schoolName);
    try {
      const qrRes = await api(`/api/transactions/${tx.id}/qr`);
      const qrData = await qrRes.json();
      if (qrData.qr) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 200;
          canvas.height = 200;
          canvas.getContext("2d").drawImage(img, 0, 0);
          // QR placed in right column: x=57, y=13, 28×28mm
          doc.addImage(canvas.toDataURL("image/png"), "PNG", 57, 13, 28, 28);
          doc.save(`meal-card-${tx.adm}.pdf`);
        };
        img.src = qrData.qr;
      } else {
        doc.save(`meal-card-${tx.adm}.pdf`);
      }
    } catch {
      doc.save(`meal-card-${tx.adm}.pdf`);
    }
  };

  const handlePrintAll = async () => {
    if (transactions.length === 0) return alert("No cards to print.");
    await handlePrintBatch(transactions, "shule-meal-cards-all.pdf");
  };

  const handlePrintSelected = async () => {
    if (selectedIds.size === 0)
      return alert("No students selected. Tick the checkboxes first.");
    const selected = transactions.filter((tx) => selectedIds.has(tx.id));
    await handlePrintBatch(selected, "shule-meal-cards-selected.pdf");
    setSelectedIds(new Set());
  };

  const handlePrintBatch = (list, filename) => {
    if (list.length === 0) return;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const qrPromises = list.map(
      (tx) =>
        new Promise((resolve) => {
          api(`/api/transactions/${tx.id}/qr`)
            .then((r) => r.json())
            .then((d) => {
              if (!d.qr) return resolve(null);
              const img = new Image();
              img.onload = () => {
                const c = document.createElement("canvas");
                c.width = 200;
                c.height = 200;
                c.getContext("2d").drawImage(img, 0, 0);
                resolve(c.toDataURL("image/png"));
              };
              img.onerror = () => resolve(null);
              img.src = d.qr;
            })
            .catch(() => resolve(null));
        }),
    );
    Promise.all(qrPromises).then((qrImages) => {
      list.forEach((tx, i) => {
        const perPage = 6,
          pos = i % perPage;
        if (pos === 0 && i !== 0) doc.addPage();
        const col = pos % 2,
          row = Math.floor(pos / 2);
        const x = 16.1 + col * 88.9,
          y = 14 + row * 62;
        drawCard(doc, tx, x, y, session.schoolName);
        if (qrImages[i])
          doc.addImage(qrImages[i], "PNG", x + 57, y + 13, 28, 28);
      });
      doc.save(filename);
    });
  };

  // Super admin panel
  if (superAdminMode) return <SuperAdminPanel onBack={() => navigate("/")} />;

  if (!session) return <LoginPage onLogin={handleLogin} />;

  // Subscription expired — block access
  if (subscription && !subscription.active) {
    return (
      <SubscriptionExpiredScreen
        state={subscription.state}
        expiry={subscription.expiry}
        onLogout={handleLogout}
      />
    );
  }

  // Teacher portal
  if (session.role === "teacher")
    return (
      <TeacherDashboard
        transactions={transactions}
        schoolName={session.schoolName}
        user={session.username || "Teacher"}
        onLogout={handleLogout}
        subscription={subscription}
      />
    );

  // Accountant portal
  if (session.role === "accountant")
    return (
      <AccountantDashboard
        schoolName={session.schoolName}
        user={session.username || "Accountant"}
        onLogout={handleLogout}
        subscription={subscription}
      />
    );

  // Admin portal
  const dueDatePreview =
    form.durationType === "days"
      ? calculateDueDate(null, form.durationDays)
      : calculateDueDate(form.durationWeeks);

  return (
    <>
      <div className="no-print min-h-screen bg-gray-50 flex flex-col">
        <SubscriptionBanner subscription={subscription} />
        <header className="bg-indigo-600 text-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex items-center space-x-3">
              <CreditCard className="w-8 h-8" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  ShuleMeal Cards
                </h1>
                <p className="text-indigo-200 text-xs">{session.schoolName}</p>
              </div>
            </div>
            <div className="flex bg-indigo-800/50 p-1 rounded-lg">
              {[
                ["admin", <FileText className="w-4 h-4" />, "Admin Dashboard"],
                ["students", <Users className="w-4 h-4" />, "Students"],
                ["scanner", <Scan className="w-4 h-4" />, "Meal Scanner"],
                ["reports", <BarChart2 className="w-4 h-4" />, "Reports"],
              ].map(([tab, icon, label]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition ${activeTab === tab ? "bg-white text-indigo-700 shadow" : "text-indigo-100 hover:text-white hover:bg-indigo-700/50"}`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            <div className="flex items-center space-x-4">
              <span className="bg-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                {session.schoolName}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 bg-indigo-700 hover:bg-indigo-800 px-3 py-1.5 rounded-lg text-sm font-medium transition"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full mx-auto py-8">
          {activeTab === "scanner" ? (
            <QRScannerTab transactions={transactions} />
          ) : activeTab === "reports" ? (
            <ReportsTab transactions={transactions} />
          ) : activeTab === "students" ? (
            <StudentsTab transactions={transactions} />
          ) : (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row gap-8">
              {/* Log Payment Form */}
              <div className="w-full md:w-1/3">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-8">
                  <div className="flex items-center space-x-2 mb-6">
                    <PlusCircle className="text-indigo-600 w-6 h-6" />
                    <h2 className="text-xl font-bold text-gray-800">
                      Log Payment
                    </h2>
                  </div>
                  <form onSubmit={handleLogPayment} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Student Name
                      </label>
                      <input
                        type="text"
                        name="studentName"
                        value={form.studentName}
                        onChange={handleFormChange}
                        placeholder="e.g. Hezbon Jr."
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Admission Number
                      </label>
                      <input
                        type="text"
                        name="adm"
                        value={form.adm}
                        onChange={handleFormChange}
                        placeholder="e.g. 4501"
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Class / Grade / Stream
                      </label>
                      <input
                        type="text"
                        name="grade"
                        value={form.grade}
                        onChange={handleFormChange}
                        placeholder="e.g. Form 2 North, Grade 5, Class 8"
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Amount Paid (KSh)
                      </label>
                      <input
                        type="number"
                        name="amount"
                        value={form.amount}
                        onChange={handleFormChange}
                        placeholder="0.00"
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Meal Plan Duration
                      </label>
                      {/* Toggle: Weeks / Days */}
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-2">
                        {["weeks", "days"].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() =>
                              setForm((p) => ({ ...p, durationType: type }))
                            }
                            className={`flex-1 py-1.5 text-sm font-semibold transition ${form.durationType === type ? "bg-indigo-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
                          >
                            {type === "weeks" ? "By Weeks" : "By Days"}
                          </button>
                        ))}
                      </div>
                      {form.durationType === "weeks" ? (
                        <select
                          name="durationWeeks"
                          value={form.durationWeeks}
                          onChange={handleFormChange}
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="1">1 Week (7 days)</option>
                          <option value="2">2 Weeks (14 days)</option>
                          <option value="4">1 Month (4 Weeks)</option>
                          <option value="12">1 Term (12 Weeks)</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            name="durationDays"
                            value={form.durationDays}
                            onChange={handleFormChange}
                            min="1"
                            max="365"
                            placeholder="e.g. 30"
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold"
                          />
                          <span className="text-sm text-gray-500 whitespace-nowrap">
                            days
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100 flex items-start space-x-3">
                      <Calendar className="text-indigo-600 w-5 h-5 mt-0.5" />
                      <div>
                        <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">
                          Calculated Next Due Date
                        </p>
                        <p className="text-lg font-bold text-gray-900">
                          {dueDatePreview}
                        </p>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Log & Database Sync</span>
                    </button>
                    <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                      <h3 className="text-sm font-bold text-indigo-800 mb-2">
                        Bulk Upload (CSV)
                      </h3>
                      <p className="text-xs text-indigo-600 mb-3">
                        Upload an Excel CSV file. Columns must be named exactly:{" "}
                        <strong>
                          Student Name, Admission Number, Grade, Amount,
                          Duration Weeks
                        </strong>
                        .
                      </p>

                      <label className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer transition">
                        <PlusCircle className="w-4 h-4" />
                        <span>Select CSV File</span>
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (!file) return;

                            Papa.parse(file, {
                              header: true,
                              skipEmptyLines: true,
                              complete: async (results) => {
                                const parsedStudents = results.data.map(
                                  (row) => ({
                                    studentName: row["Student Name"],
                                    adm: row["Admission Number"],
                                    grade: row["Grade"] || "",
                                    amount: row["Amount"] || 0,
                                    durationWeeks: row["Duration Weeks"] || 12,
                                  }),
                                );

                                if (
                                  !window.confirm(
                                    `Found ${parsedStudents.length} students. Upload them now?`,
                                  )
                                )
                                  return;

                                try {
                                  const token =
                                    localStorage.getItem("shulemeal_token");
                                  const res = await fetch(
                                    "/api/transactions/bulk",
                                    {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${token}`,
                                      },
                                      body: JSON.stringify({
                                        students: parsedStudents,
                                      }),
                                    },
                                  );

                                  const data = await res.json();
                                  if (res.ok) {
                                    alert(
                                      `Success! Added ${data.added} students. Skipped ${data.skipped} duplicates.`,
                                    );
                                    window.location.reload(); // Refresh to see the new data
                                  } else {
                                    alert("Error: " + data.error);
                                  }
                                } catch (err) {
                                  alert("Failed to reach server.");
                                }
                              },
                            });
                          }}
                        />
                      </label>
                    </div>
                  </form>
                </div>
              </div>

              {/* Records */}
              <div className="w-full md:w-2/3 flex flex-col">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                    <div className="bg-green-100 p-3 rounded-full">
                      <CreditCard className="text-green-600 w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">
                        Total Collected
                      </p>
                      <p className="text-xl font-bold text-gray-900">
                        KSh{" "}
                        {transactions
                          .reduce((s, tx) => s + tx.amount, 0)
                          .toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                    <div className="bg-blue-100 p-3 rounded-full">
                      <Users className="text-blue-600 w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">
                        Active Records
                      </p>
                      <p className="text-xl font-bold text-gray-900">
                        {transactions.length}
                      </p>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                    <div className="bg-orange-100 p-3 rounded-full">
                      <Calendar className="text-orange-600 w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">
                        Expiring Soon
                      </p>
                      <p className="text-xl font-bold text-gray-900">
                        {
                          transactions.filter((tx) => {
                            const diff =
                              (parseLocalDate(tx.dueDate) - todayStart()) /
                              (1000 * 60 * 60 * 24);
                            return diff >= 0 && diff <= 7;
                          }).length
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                      <FileText className="w-5 h-5 mr-2 text-indigo-500" />{" "}
                      Database Records
                    </h2>
                    <div className="flex items-center gap-2">
                      {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg">
                            {selectedIds.size} selected
                          </span>
                          <button
                            onClick={handlePrintSelected}
                            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition"
                          >
                            <Printer className="w-4 h-4" /> Print Selected
                          </button>
                          <button
                            onClick={() => setSelectedIds(new Set())}
                            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
                          >
                            <X className="w-4 h-4" /> Clear
                          </button>
                        </div>
                      )}
                      <button
                        onClick={handlePrintAll}
                        className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold px-4 py-2 rounded-lg transition"
                      >
                        <Printer className="w-4 h-4" /> Print All
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                          <th className="py-3 px-4 w-10">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                              checked={
                                transactions.length > 0 &&
                                selectedIds.size === transactions.length
                              }
                              onChange={(e) =>
                                setSelectedIds(
                                  e.target.checked
                                    ? new Set(transactions.map((t) => t.id))
                                    : new Set(),
                                )
                              }
                              title="Select all"
                            />
                          </th>
                          <th className="py-3 px-6 font-semibold">Student</th>
                          <th className="py-3 px-6 font-semibold">
                            Grade / Stream
                          </th>
                          <th className="py-3 px-6 font-semibold">Amount</th>
                          <th className="py-3 px-6 font-semibold">Paid On</th>
                          <th className="py-3 px-6 font-semibold">Next Due</th>
                          <th className="py-3 px-6 font-semibold text-center">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => (
                          <tr
                            key={tx.id}
                            className={`border-b border-gray-100 hover:bg-gray-50 transition ${selectedIds.has(tx.id) ? "bg-indigo-50/60" : ""}`}
                          >
                            <td className="py-4 px-4 w-10">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                                checked={selectedIds.has(tx.id)}
                                onChange={(e) => {
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    e.target.checked
                                      ? next.add(tx.id)
                                      : next.delete(tx.id);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td className="py-4 px-6">
                              <p className="font-bold text-gray-900">
                                {tx.studentName}
                              </p>
                              <p className="text-xs text-gray-500 font-medium">
                                ADM: {tx.adm}
                              </p>
                            </td>
                            <td className="py-4 px-6">
                              {tx.grade ? (
                                <span className="inline-block px-2 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700">
                                  {tx.grade}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-4 px-6 font-bold text-gray-700">
                              KSh {tx.amount.toLocaleString()}
                            </td>
                            <td className="py-4 px-6 text-sm text-gray-600">
                              {tx.paidDate}
                            </td>
                            <td className="py-4 px-6">
                              <span
                                className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${parseLocalDate(tx.dueDate) >= todayStart() ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                              >
                                {tx.dueDate}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Tooltip text="Print Card" color="indigo">
                                  <button
                                    onClick={() => setPreviewCard(tx)}
                                    className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                                  >
                                    <Printer className="w-5 h-5" />
                                  </button>
                                </Tooltip>
                                <Tooltip text="Renew Meal Plan" color="green">
                                  <button
                                    onClick={() => {
                                      setRenewingTx(tx);
                                      setRenewForm({
                                        amount: "",
                                        durationWeeks: "4",
                                      });
                                    }}
                                    className="p-2 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition"
                                  >
                                    <CheckCircle2 className="w-5 h-5" />
                                  </button>
                                </Tooltip>
                                <Tooltip
                                  text="Replace Lost Card"
                                  color="orange"
                                >
                                  <button
                                    onClick={() => handleReplaceCard(tx)}
                                    className="p-2 text-orange-500 bg-orange-50 hover:bg-orange-100 rounded-lg transition"
                                  >
                                    <ShieldCheck className="w-5 h-5" />
                                  </button>
                                </Tooltip>
                                <Tooltip
                                  text="Pledge — parent pays later"
                                  color="amber"
                                >
                                  <button
                                    onClick={() => {
                                      setPledgeTx(tx);
                                      setPledgeForm({
                                        pledgeAmount: "",
                                        durationWeeks: "4",
                                      });
                                    }}
                                    className="p-2 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition"
                                  >
                                    <span className="text-base font-bold leading-none">
                                      ◆
                                    </span>
                                  </button>
                                </Tooltip>
                                <Tooltip
                                  text="Special Case — scholarship / sponsorship"
                                  color="cyan"
                                >
                                  <button
                                    onClick={() => handleSpecialCase(tx)}
                                    className="p-2 text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition"
                                  >
                                    <span className="text-base font-bold leading-none">
                                      ★
                                    </span>
                                  </button>
                                </Tooltip>
                                <Tooltip
                                  text="Archive — data preserved, restorable"
                                  color="red"
                                >
                                  <button
                                    onClick={() => handleDelete(tx.id)}
                                    className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {transactions.length === 0 && (
                          <tr>
                            <td
                              colSpan="5"
                              className="py-8 text-center text-gray-500"
                            >
                              No records found in database.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Archived Students Panel */}
              <div className="mt-6">
                <button
                  onClick={() => {
                    if (!showArchived) fetchArchived();
                    setShowArchived((v) => !v);
                  }}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  {showArchived ? "Hide" : "Show"} Archived Students
                  {archivedTransactions.length > 0 && (
                    <span className="ml-1 bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                      {archivedTransactions.length}
                    </span>
                  )}
                </button>

                {showArchived && (
                  <div className="mt-4 bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
                    <div className="p-4 border-b border-red-100 bg-red-50 flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-red-500" />
                      <h3 className="font-bold text-red-700 text-sm">
                        Archived Students
                      </h3>
                      <span className="text-xs text-red-500 ml-1">
                        — hidden from dashboard, data preserved
                      </span>
                    </div>
                    {archivedTransactions.length === 0 ? (
                      <p className="p-6 text-center text-gray-400 text-sm">
                        No archived records.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                              <th className="py-3 px-5 font-semibold">
                                Student
                              </th>
                              <th className="py-3 px-5 font-semibold">
                                ADM No.
                              </th>
                              <th className="py-3 px-5 font-semibold">Grade</th>
                              <th className="py-3 px-5 font-semibold">
                                Amount
                              </th>
                              <th className="py-3 px-5 font-semibold">
                                Due Date
                              </th>
                              <th className="py-3 px-5 font-semibold text-center">
                                Restore
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {archivedTransactions.map((tx) => (
                              <tr
                                key={tx.id}
                                className="border-b border-gray-50 hover:bg-red-50/30 transition"
                              >
                                <td className="py-3 px-5 font-semibold text-gray-700">
                                  {tx.studentName}
                                </td>
                                <td className="py-3 px-5 text-gray-500 text-sm font-mono">
                                  {tx.adm}
                                </td>
                                <td className="py-3 px-5">
                                  {tx.grade ? (
                                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700">
                                      {tx.grade}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-5 text-gray-600 font-bold text-sm">
                                  KSh {tx.amount?.toLocaleString()}
                                </td>
                                <td className="py-3 px-5 text-sm text-gray-500">
                                  {tx.dueDate}
                                </td>
                                <td className="py-3 px-5 text-center">
                                  <button
                                    onClick={() => handleRestore(tx.id)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition"
                                    title="Restore to active dashboard"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />{" "}
                                    Restore
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Card Preview Modal */}
      {previewCard && (
        <div
          className="no-print fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-6 relative">
            <button
              onClick={() => setPreviewCard(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-800">
              Meal Card Preview
            </h2>
            <div id="print-card-area">
              <MealCard
                tx={previewCard}
                template={cardTemplate}
                schoolName={session?.schoolName}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handlePrint(previewCard)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg transition"
              >
                <Printer className="w-4 h-4" /> Print Card
              </button>
              <button
                onClick={() => setPreviewCard(null)}
                className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Modal */}
      {renewingTx && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm relative">
            <button
              onClick={() => setRenewingTx(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-800 mb-1">
              Renew Meal Card
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {renewingTx.studentName} — ADM: {renewingTx.adm}
            </p>
            <form onSubmit={handleRenew} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Amount Paid (KSh)
                </label>
                <input
                  type="number"
                  value={renewForm.amount}
                  onChange={(e) =>
                    setRenewForm((p) => ({ ...p, amount: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none font-bold"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Extend By
                </label>
                <select
                  value={renewForm.durationWeeks}
                  onChange={(e) =>
                    setRenewForm((p) => ({
                      ...p,
                      durationWeeks: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
                >
                  <option value="1">1 Week</option>
                  <option value="2">2 Weeks</option>
                  <option value="4">1 Month (4 Weeks)</option>
                  <option value="12">1 Term (12 Weeks)</option>
                </select>
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-100 text-sm text-green-700">
                Current due date:{" "}
                <span className="font-bold">{renewingTx.dueDate}</span>
              </div>
              <button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <CheckCircle2 className="w-5 h-5" /> Confirm Renewal
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pledge Modal */}
      {pledgeTx && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm relative">
            <button
              onClick={() => setPledgeTx(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-500 text-xl font-bold">◆</span>
              <h2 className="text-lg font-bold text-gray-800">Pledge Card</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              {pledgeTx.studentName} — ADM: {pledgeTx.adm}
            </p>
            <form onSubmit={handlePledge} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Amount Pledged (KSh)
                </label>
                <input
                  type="number"
                  value={pledgeForm.pledgeAmount}
                  onChange={(e) =>
                    setPledgeForm((p) => ({
                      ...p,
                      pledgeAmount: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                  className="w-full px-4 py-2 bg-gray-50 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none font-bold"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Extend By
                </label>
                <select
                  value={pledgeForm.durationWeeks}
                  onChange={(e) =>
                    setPledgeForm((p) => ({
                      ...p,
                      durationWeeks: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-2 bg-gray-50 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none"
                >
                  <option value="1">1 Week</option>
                  <option value="2">2 Weeks</option>
                  <option value="4">1 Month (4 Weeks)</option>
                  <option value="12">1 Term (12 Weeks)</option>
                </select>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-100 text-sm text-amber-700">
                Card valid until:{" "}
                <span className="font-bold">
                  {calculateDueDate(pledgeForm.durationWeeks)}
                </span>
                . The pledged amount is due at a later date.
              </div>
              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <span className="text-base">◆</span> Generate Pledge Card
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Special Case Modal */}
      {specialTx && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm relative">
            <button
              onClick={() => setSpecialTx(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-purple-500 text-xl font-bold">★</span>
              <h2 className="text-lg font-bold text-gray-800">
                Special Case Card
              </h2>
            </div>
            <p className="text-sm text-gray-500 mb-1">
              {specialTx.studentName} — ADM: {specialTx.adm}
            </p>
            <p className="text-xs text-gray-400 mb-6">
              Scholarship / Sponsorship / Donor-funded
            </p>
            <form onSubmit={handleSpecialCaseSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Extend By
                </label>
                <select
                  value={specialForm.durationWeeks}
                  onChange={(e) =>
                    setSpecialForm((p) => ({
                      ...p,
                      durationWeeks: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-2 bg-gray-50 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                >
                  <option value="1">1 Week</option>
                  <option value="2">2 Weeks</option>
                  <option value="4">1 Month (4 Weeks)</option>
                  <option value="12">1 Term (12 Weeks)</option>
                </select>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-100 text-sm text-purple-700">
                Card valid until:{" "}
                <span className="font-bold">
                  {calculateDueDate(specialForm.durationWeeks)}
                </span>
              </div>
              <button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <span className="text-base">★</span> Generate Special Case Card
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
