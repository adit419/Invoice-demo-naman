import { FormEvent, useRef, useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui";
import { Button, Card, Input } from "@/components/ui";
import { ApiError } from "@/services";

// ── All available modules ─────────────────────────────────────────────────────

const ALL_MODULES = [
  { key: "dashboard",        label: "Dashboard" },
  { key: "reporting",        label: "Reporting" },
  { key: "arForecast",       label: "AR Forecast" },
  { key: "cashApplication",  label: "Cash Application" },
  { key: "cashAppB2B",       label: "Cash App B2B" },
  { key: "claimEngine",      label: "Pricing & Claims" },
  { key: "askNeoflo",        label: "Ask Neo" },
  { key: "vendorOnboarding", label: "Vendor Onboarding" },
  { key: "driverOnboarding", label: "Driver Onboarding" },
  { key: "freight",          label: "Freight" },
  { key: "financeOS",        label: "Finance OS" },
];

export const NAV_MODULE_FILTER_KEY = "nav_module_filter";

// ── Module multi-select dropdown ─────────────────────────────────────────────

function ModuleSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(key: string) {
    onChange(
      selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]
    );
  }

  const label =
    selected.length === 0
      ? "All modules (no restriction)"
      : selected.length === ALL_MODULES.length
      ? "All modules selected"
      : `${selected.length} module${selected.length > 1 ? "s" : ""} selected`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 5 }}>
        Modules to show{" "}
        <span style={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 400 }}>(optional — leave blank for all)</span>
      </label>

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db",
          background: "#fff", fontSize: 13.5, color: selected.length ? "#0f172a" : "#9ca3af",
          cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "#274B95")}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = "#d1d5db"; }}
      >
        <span>{label}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{ flexShrink: 0, transition: "transform 0.18s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          <path d="M2 5l5 5 5-5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          {/* Select all / Clear bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
            <button type="button" onClick={() => onChange(ALL_MODULES.map(m => m.key))}
              style={{ fontSize: 11.5, color: "#274B95", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
              Select all
            </button>
            <span style={{ fontSize: 11, color: "#d1d5db" }}>|</span>
            <button type="button" onClick={() => onChange([])}
              style={{ fontSize: 11.5, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              Clear
            </button>
          </div>

          {/* Scrollable list — compact 2-column grid */}
          <div style={{ padding: "6px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, maxHeight: 220, overflowY: "auto" }}>
            {ALL_MODULES.map(m => {
              const checked = selected.includes(m.key);
              return (
                <label key={m.key}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                    background: checked ? "#eff6ff" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLLabelElement).style.background = "#f9fafb"; }}
                  onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLLabelElement).style.background = checked ? "#eff6ff" : "transparent"; }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(m.key)}
                    style={{ width: 13, height: 13, accentColor: "#274B95", flexShrink: 0, cursor: "pointer" }} />
                  <span style={{ fontSize: 12.5, color: checked ? "#274B95" : "#374151", fontWeight: checked ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.label}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Selected count footer */}
          {selected.length > 0 && (
            <div style={{ padding: "6px 12px", borderTop: "1px solid #f3f4f6", fontSize: 11.5, color: "#274B95", fontWeight: 500, background: "#fafafa" }}>
              {selected.length} of {ALL_MODULES.length} selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Login page ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const registered = router.query.registered === "1";

  const [email,      setEmail]    = useState("");
  const [password,   setPassword] = useState("");
  const [loading,    setLoading]  = useState(false);
  const [errors,     setErrors]   = useState<{ email?: string; password?: string }>({});
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!email)    errs.email    = "Email is required";
    if (!password) errs.password = "Password is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      await login(email, password);
      // Save module selection to localStorage before redirecting
      if (selectedModules.length > 0) {
        localStorage.setItem(NAV_MODULE_FILTER_KEY, JSON.stringify(selectedModules));
      } else {
        // Default: show all modules except Freight and Driver Onboarding
        const defaultModules = ALL_MODULES
          .map(m => m.key)
          .filter(k => k !== "freight" && k !== "driverOnboarding");
        localStorage.setItem(NAV_MODULE_FILTER_KEY, JSON.stringify(defaultModules));
      }
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Login failed";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-text-heading tracking-tight">Neoflo</h1>
          <p className="text-sm text-text-caption mt-1">Invoice Processing Platform</p>
        </div>

        {/* Post-signup banner */}
        {registered && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm"
            style={{ background: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }}>
            <span className="font-semibold">Account created!</span> Your account is pending
            tenant assignment. Please contact your administrator to gain access.
          </div>
        )}

        <Card surface="1" padding="lg" shadow>
          <h2 className="text-lg font-semibold text-text-heading mb-6">Sign in</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Email address"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              autoComplete="email"
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              autoComplete="current-password"
            />

            {/* Module selector */}
            <ModuleSelect selected={selectedModules} onChange={setSelectedModules} />

            <Button type="submit" variant="primary" fullWidth loading={loading} className="mt-2">
              Sign in
            </Button>
          </form>

          <p className="text-xs text-text-caption text-center mt-5">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-text-primary hover:text-text-primary-hover font-medium">
              Create one
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
