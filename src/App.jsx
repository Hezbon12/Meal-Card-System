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
            <div className="grid grid-cols-2 gap-2">
              {["admin", "teacher"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setCreds({ ...creds, role: r })}
                  className={`py-2 rounded-lg text-sm font-bold border transition ${creds.role === r ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300"}`}
                >
                  {r === "admin" ? "🛡 Admin" : "📖 Teacher"}
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
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    adminPassword: "",
    teacherPassword: "",
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
    setForm({ name: "", username: "", adminPassword: "", teacherPassword: "" });
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
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  const startCamera = async () => {
    setError(null);
    setScanResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
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
    const canvas = canvasRef.current,
      video = videoRef.current,
      ctx = canvas.getContext("2d");
    const tick = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const code = jsQR(
          ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
        );
        if (code) {
          stopCamera();
          verifyCard(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scanning]);

  useEffect(() => () => stopCamera(), []);

  const verifyCard = async (text) => {
    try {
      const payload = JSON.parse(text);
      if (!payload.token) throw new Error("Invalid QR");
      // Use server-side verification so scan is logged and school-scoped
      const res = await api("/api/scan", {
        method: "POST",
        body: JSON.stringify({ token: payload.token }),
      });
      const data = await res.json();
      setScanResult(data);
    } catch {
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
      {!scanResult && (
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
              <Scan className="w-5 h-5" /> Start Camera Scanner
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
              <h3 className="text-2xl font-bold text-green-800 mb-2">
                VALID MEAL
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
              <div className="mt-4 bg-orange-100 border border-orange-200 rounded-lg px-4 py-2">
                <p className="text-xs text-orange-700 font-bold uppercase tracking-wide">
                  This student has already received a meal today
                </p>
              </div>
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
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [activePanel, setActivePanel] = useState(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeCards = transactions.filter(
    (tx) => new Date(tx.dueDate) >= today,
  );
  const expiredCards = transactions.filter(
    (tx) => new Date(tx.dueDate) < today,
  );
  const totalCollected = transactions.reduce((s, tx) => s + tx.amount, 0);

  useEffect(() => {
    Promise.all([
      api("/api/scans/summary").then((r) => r.json()),
      api("/api/scans/detailed").then((r) => r.json()),
    ])
      .then(([summary, detailed]) => {
        setScanSummary(summary);
        setDetailedScans(detailed);
        if (summary.length > 0) setSelectedDate(summary[0].date);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const scansForDate = detailedScans.filter((s) =>
    s.scanDate?.startsWith(selectedDate),
  );

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
      { label: "Adm No.", x: 90, val: (r) => r.adm },
      { label: "Due Date", x: 130, val: (r) => r.dueDate },
      {
        label: "Status",
        x: 165,
        val: (r) => (new Date(r.dueDate) >= today ? "ACTIVE" : "EXPIRED"),
        color: (r) =>
          new Date(r.dueDate) >= today ? [22, 163, 74] : [220, 38, 38],
      },
    ]);
    doc.addPage();
    y = 20;
    renderTable("Detailed Scan Records", detailedScans, [
      { label: "Date & Time", x: 18, val: (s) => formatScanTime(s.scanDate) },
      { label: "Student Name", x: 70, val: (s) => s.studentName || "Unknown" },
      { label: "Adm No.", x: 135, val: (s) => s.adm || "-" },
      {
        label: "Status",
        x: 165,
        val: (s) => s.status,
        color: (s) => (s.status === "APPROVED" ? [22, 163, 74] : [220, 38, 38]),
      },
    ]);
    doc.save("shulemeal-report.pdf");
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
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold ${new Date(tx.dueDate) >= today ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
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
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                <th className="py-3 px-6 font-semibold">Date</th>
                <th className="py-3 px-6 font-semibold">Total</th>
                <th className="py-3 px-6 font-semibold text-green-700">
                  Approved
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
                  <td className="py-3 px-6 font-bold text-gray-700">
                    {row.total}
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
        )}
      </div>
      {selectedDate && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">
              Students who ate on {selectedDate} ({scansForDate.length})
            </h3>
            <button
              onClick={() => setSelectedDate("")}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {scansForDate.length === 0 ? (
            <p className="p-6 text-center text-gray-400">
              No records for this date.
            </p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                  <th className="py-3 px-6 font-semibold">Student Name</th>
                  <th className="py-3 px-6 font-semibold">Adm No.</th>
                  <th className="py-3 px-6 font-semibold">Time</th>
                  <th className="py-3 px-6 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {scansForDate.map((s, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-3 px-6 font-medium text-gray-800">
                      {s.studentName || "Unknown"}
                    </td>
                    <td className="py-3 px-6 text-gray-600">{s.adm}</td>
                    <td className="py-3 px-6 text-gray-500 text-sm">
                      {formatScanTime(s.scanDate)}
                    </td>
                    <td className="py-3 px-6">
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold ${s.status === "APPROVED" ? "bg-green-100 text-green-700" : s.status === "DUPLICATE" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}
                      >
                        {s.status === "DUPLICATE" ? "DOUBLE-DIP" : s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
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
                        <th className="py-3 px-5 font-semibold">Due Date</th>
                        <th className="py-3 px-5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((tx) => {
                        const isActive = new Date(tx.dueDate) >= today;
                        const daysLeft = Math.ceil(
                          (new Date(tx.dueDate) - today) /
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

// ─── Meal Card Visual ─────────────────────────────────────────
function MealCard({ tx, template, schoolName }) {
  const [qrSrc, setQrSrc] = useState(null);

  // Use template colors or defaults
  const primaryColor = template?.primaryColor || "#3730a3";
  const secondaryColor = template?.secondaryColor || "#4338ca";
  const backgroundColor = template?.backgroundColor || "#ffffff";
  const textColor = template?.textColor || "#111827";
  const borderRadius = template?.borderRadius || 6;
  const qrPosition = template?.qrPosition || "right";
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

  const cardStyle = {
    width: "3.5in",
    height: "2in",
    border: `2px solid ${primaryColor}`,
    backgroundColor: backgroundColor,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: "12px",
    boxSizing: "border-box",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: `${borderRadius}px`,
  };

  const headerStyle = {
    backgroundColor: primaryColor,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const contentStyle = {
    marginTop: "44px",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
  };

  const infoColumnStyle = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    width: qrPosition === "center" ? "100%" : "62%",
    height: "100%",
  };

  const qrColumnStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderLeft: qrPosition !== "center" ? "1px solid #e5e7eb" : "none",
    borderRight: qrPosition === "center" ? "1px solid #e5e7eb" : "none",
    paddingLeft: qrPosition === "left" ? "12px" : "0",
    paddingRight: qrPosition === "right" ? "12px" : "0",
    height: "100%",
    order: qrPosition === "left" ? 2 : qrPosition === "right" ? 3 : 1,
  };

  const infoWrapperStyle = {
    order: qrPosition === "center" ? 2 : 1,
    display: "flex",
    flexDirection: qrPosition === "center" ? "row" : "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "12px",
    width: qrPosition === "center" ? "auto" : "100%",
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span
          style={{
            color: "#ffffff",
            fontWeight: 800,
            fontSize: "0.875rem",
            letterSpacing: "0.1em",
          }}
        >
          SHULE MEAL CARD
        </span>
      </div>
      <div style={contentStyle}>
        {qrPosition === "left" && (
          <div style={qrColumnStyle}>
            <div
              style={{
                padding: "4px",
                backgroundColor: "#fff",
                border: `1px solid ${secondaryColor}`,
                borderRadius: "6px",
              }}
            >
              <img src={qrSrc || ""} width="60" height="60" alt="QR Code" />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: "4px",
                color: secondaryColor,
              }}
            >
              <ShieldCheck
                style={{ width: "10px", height: "10px", marginRight: "3px" }}
              />
              <span style={{ fontSize: "7px", fontWeight: "bold" }}>
                VERIFIED
              </span>
            </div>
          </div>
        )}

        <div style={infoWrapperStyle}>
          <div style={infoColumnStyle}>
            {showSchoolName && (
              <div>
                <p
                  style={{
                    fontSize: "9px",
                    color: textColor,
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    margin: "0 0 2px",
                    opacity: 0.7,
                  }}
                >
                  School
                </p>
                <p
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: textColor,
                    margin: 0,
                    lineHeight: 1.1,
                  }}
                >
                  {schoolName || tx.schoolName || "ShuleMeal School"}
                </p>
              </div>
            )}
            <div>
              <p
                style={{
                  fontSize: "9px",
                  color: textColor,
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  margin: "0 0 2px",
                  opacity: 0.7,
                }}
              >
                Student
              </p>
              <p
                style={{
                  fontSize: "1rem",
                  fontWeight: 800,
                  color: textColor,
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                {tx.studentName}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: "9px",
                  color: textColor,
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  margin: "0 0 2px",
                  opacity: 0.7,
                }}
              >
                Admission No.
              </p>
              <p
                style={{
                  fontSize: "0.875rem",
                  fontWeight: "bold",
                  color: textColor,
                  margin: 0,
                }}
              >
                {tx.adm}
              </p>
            </div>
            <div
              style={{
                backgroundColor: "#fef2f2",
                padding: "5px 8px",
                borderRadius: "4px",
                border: "1px solid #fecaca",
                display: "inline-block",
              }}
            >
              <p
                style={{
                  fontSize: "8px",
                  color: "#dc2626",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  margin: "0 0 1px",
                }}
              >
                Next Due Date
              </p>
              <p
                style={{
                  fontSize: "0.875rem",
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

        {qrPosition === "right" && (
          <div style={qrColumnStyle}>
            <div
              style={{
                padding: "4px",
                backgroundColor: "#fff",
                border: `1px solid ${secondaryColor}`,
                borderRadius: "6px",
              }}
            >
              <img src={qrSrc || ""} width="60" height="60" alt="QR Code" />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: "4px",
                color: secondaryColor,
              }}
            >
              <ShieldCheck
                style={{ width: "10px", height: "10px", marginRight: "3px" }}
              />
              <span style={{ fontSize: "7px", fontWeight: "bold" }}>
                VERIFIED
              </span>
            </div>
          </div>
        )}

        {qrPosition === "center" && (
          <div style={qrColumnStyle}>
            <div
              style={{
                padding: "4px",
                backgroundColor: "#fff",
                border: `1px solid ${secondaryColor}`,
                borderRadius: "6px",
              }}
            >
              <img src={qrSrc || ""} width="60" height="60" alt="QR Code" />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: "4px",
                color: secondaryColor,
              }}
            >
              <ShieldCheck
                style={{ width: "10px", height: "10px", marginRight: "3px" }}
              />
              <span style={{ fontSize: "7px", fontWeight: "bold" }}>
                VERIFIED
              </span>
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: "4px",
          right: "8px",
          fontSize: "7px",
          color: "#9ca3af",
        }}
      >
        ID: {String(tx.id).slice(-6)} | {tx.paidDate}
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
  const [subscription, setSubscription] = useState(() => {
    const meta = localStorage.getItem("shulemeal_meta");
    return meta ? JSON.parse(meta).subscription || null : null;
  });
  const [form, setForm] = useState({
    studentName: "",
    adm: "",
    amount: "",
    durationWeeks: "4",
  });
  const [previewCard, setPreviewCard] = useState(null);
  const [renewingTx, setRenewingTx] = useState(null);
  const [renewForm, setRenewForm] = useState({
    amount: "",
    durationWeeks: "4",
  });
  const [cardTemplate, setCardTemplate] = useState(null);

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
      // setTransactions(data); // uncomment if you actually use this state
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
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

  const calculateDueDate = (weeks) => {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(weeks) * 7);
    return d.toISOString().split("T")[0];
  };

  const handleFormChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this entry? This cannot be undone.")) return;
    const res = await api(`/api/transactions/${id}`, { method: "DELETE" });
    if (res.ok) setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    else alert("Delete failed.");
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

  const handleLogPayment = async (e) => {
    e.preventDefault();
    if (!form.studentName || !form.adm || !form.amount)
      return alert("Please fill all fields");
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
      dueDate: calculateDueDate(form.durationWeeks),
      status: "Active",
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
    setForm({ studentName: "", adm: "", amount: "", durationWeeks: "4" });
    setPreviewCard(saved);
  };

  const drawCard = (doc, tx, originX, originY, schoolName) => {
    const W = 88.9,
      H = 60,          // taller card so all content fits
      lx = originX + 5;

    // Background + border
    doc.setFillColor(255, 255, 255);
    doc.rect(originX, originY, W, H, "F");
    doc.setDrawColor(49, 46, 129);
    doc.setLineWidth(0.4);
    doc.rect(originX + 0.3, originY + 0.3, W - 0.6, H - 0.6);

    // Header bar
    doc.setFillColor(55, 48, 163);
    doc.rect(originX, originY, W, 12, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("SHULE MEAL CARD", originX + W / 2, originY + 7.5, { align: "center" });

    // SCHOOL label + value (starts below header)
    doc.setFontSize(5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text("SCHOOL", lx, originY + 16);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(schoolName || "ShuleMeal School", lx, originY + 21);

    // STUDENT label + value
    doc.setFontSize(5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text("STUDENT", lx, originY + 27);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(tx.studentName, lx, originY + 33);

    // ADMISSION NO. label + value
    doc.setFontSize(5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text("ADMISSION NO.", lx, originY + 39);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(31, 41, 55);
    doc.text(tx.adm, lx, originY + 44.5);

    // NEXT DUE DATE box — fully inside the card
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(254, 202, 202);
    doc.setLineWidth(0.3);
    doc.roundedRect(lx - 1, originY + 47, 44, 9, 1, 1, "FD");
    doc.setFontSize(5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(220, 38, 38);
    doc.text("NEXT DUE DATE", lx, originY + 51);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(185, 28, 28);
    doc.text(tx.dueDate, lx, originY + 55.5);

    // Vertical divider between info and QR column
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(originX + 58, originY + 13, originX + 58, originY + 57);

    // Footer: ID + paid date
    doc.setFontSize(4.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(156, 163, 175);
    doc.text(
      `ID: ${String(tx.id).slice(-6)} | ${tx.paidDate}`,
      originX + W - 3,
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
          doc.addImage(canvas.toDataURL("image/png"), "PNG", 58, 14, 30, 30);
          doc.setFontSize(5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(67, 56, 202);
          doc.text("✓ VERIFIED", 73, 47, { align: "center" });
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
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const qrPromises = transactions.map(
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
      transactions.forEach((tx, i) => {
        const perPage = 6,   // 3 rows × 2 cols on A4
          pos = i % perPage;
        if (pos === 0 && i !== 0) doc.addPage();
        const col = pos % 2,
          row = Math.floor(pos / 2);
        const x = 16.1 + col * 88.9,
          y = 14 + row * 62;
        drawCard(doc, tx, x, y, session.schoolName);
        if (qrImages[i]) {
          doc.addImage(qrImages[i], "PNG", x + 58, y + 14, 30, 30);
          doc.setFontSize(5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(67, 56, 202);
          doc.text("✓ VERIFIED", x + 73, y + 47, { align: "center" });
        }
      });
      doc.save("shule-meal-cards-all.pdf");
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

  // Admin portal
  const dueDatePreview = calculateDueDate(form.durationWeeks);

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
                      <select
                        name="durationWeeks"
                        value={form.durationWeeks}
                        onChange={handleFormChange}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="1">1 Week</option>
                        <option value="2">2 Weeks</option>
                        <option value="4">1 Month (4 Weeks)</option>
                        <option value="12">1 Term (12 Weeks)</option>
                      </select>
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
                              (new Date(tx.dueDate) - new Date()) /
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
                    <button
                      onClick={handlePrintAll}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition"
                    >
                      <Printer className="w-4 h-4" /> Print All Cards
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                          <th className="py-3 px-6 font-semibold">Student</th>
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
                            className="border-b border-gray-100 hover:bg-gray-50 transition"
                          >
                            <td className="py-4 px-6">
                              <p className="font-bold text-gray-900">
                                {tx.studentName}
                              </p>
                              <p className="text-xs text-gray-500 font-medium">
                                ADM: {tx.adm}
                              </p>
                            </td>
                            <td className="py-4 px-6 font-bold text-gray-700">
                              KSh {tx.amount.toLocaleString()}
                            </td>
                            <td className="py-4 px-6 text-sm text-gray-600">
                              {tx.paidDate}
                            </td>
                            <td className="py-4 px-6">
                              <span
                                className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${new Date(tx.dueDate) >= new Date() ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                              >
                                {tx.dueDate}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center flex items-center justify-center gap-1">
                              <button
                                onClick={() => setPreviewCard(tx)}
                                className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                                title="Print Card"
                              >
                                <Printer className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => {
                                  setRenewingTx(tx);
                                  setRenewForm({
                                    amount: "",
                                    durationWeeks: "4",
                                  });
                                }}
                                className="p-2 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition"
                                title="Renew"
                              >
                                <CheckCircle2 className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleReplaceCard(tx)}
                                className="p-2 text-orange-500 bg-orange-50 hover:bg-orange-100 rounded-lg transition"
                                title="Replace Lost Card"
                              >
                                <ShieldCheck className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleDelete(tx.id)}
                                className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition"
                                title="Delete"
                              >
                                <X className="w-5 h-5" />
                              </button>
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
    </>
  );
}
