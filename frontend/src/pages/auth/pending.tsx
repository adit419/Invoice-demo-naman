import { useAuth } from "@/hooks/useAuth";

export default function PendingPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-md text-center animate-fade-in">
        {/* Icon */}
        <div
          className="mx-auto mb-6 w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="13" stroke="#60a5fa" strokeWidth="1.8" />
            <path d="M16 10v7" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="16" cy="21.5" r="1" fill="#60a5fa" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-text-heading mb-3">
          Access Pending
        </h1>

        <p className="text-sm mb-2" style={{ color: "#94a3b8" }}>
          Hi <span className="font-semibold" style={{ color: "#f1f5f9" }}>{user?.full_name || user?.email}</span>,
          your account has been created but hasn&apos;t been assigned to a tenant yet.
        </p>
        <p className="text-sm mb-8" style={{ color: "#94a3b8" }}>
          Please contact your administrator to get access. Once your account is approved
          you can sign in and start working.
        </p>

        <button
          onClick={() => logout()}
          className="text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
