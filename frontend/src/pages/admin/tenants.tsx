import { useCallback, useEffect, useState } from "react";
import { withAuthGuard } from "@/components/AuthGuard";
import { Button, Spinner } from "@/components/ui";
import { ApiError, tenantsService } from "@/services";
import { useToast } from "@/components/ui";
import { formatDate } from "@/utils/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  user_count: number;
  created_at: string | null;
}

// ── Create Modal ──────────────────────────────────────────────────────────────

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (t: TenantRecord) => void;
}

function CreateModal({ open, onClose, onCreated }: CreateModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) { toast("Name is required", "error"); return; }
    setLoading(true);
    try {
      const result = await tenantsService.create<TenantRecord>(name.trim());
      toast(`Tenant "${result.name}" created`, "success");
      onCreated(result);
      onClose();
      setName("");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Create failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="rounded-2xl flex flex-col gap-5 p-7" style={{ background: "#0e1424", border: "1px solid rgba(255,255,255,0.1)", width: 400, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: "#f1f5f9" }}>New Tenant</h2>
          <button onClick={onClose} style={{ color: "#64748b" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>Organisation Name</label>
          <input
            type="text"
            placeholder="e.g. ACME Corp"
            autoFocus
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#f1f5f9" }}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
          {name.trim() && (
            <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
              Slug: {name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Cancel
          </button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={loading}>
            Create Tenant
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function TenantsPage() {
  const { toast } = useToast();
  const [tenantList, setTenantList] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    try {
      const result = await tenantsService.list<TenantRecord>();
      setTenantList(result);
    } catch {
      toast("Failed to load tenants", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const handleToggleActive = async (t: TenantRecord) => {
    setUpdatingId(t.id);
    try {
      const updated = await tenantsService.update<TenantRecord>(t.id, { is_active: !t.is_active });
      setTenantList(prev => prev.map(x => x.id === t.id ? { ...x, ...updated } : x));
      toast(`${t.name} ${!t.is_active ? "activated" : "deactivated"}`, "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Update failed", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#080c18" }}><Spinner size="lg" /></div>;
  }

  return (
    <div className="min-h-screen" style={{ background: "#080c18" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b px-6 py-4" style={{ background: "#0a0e1a", borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold" style={{ color: "#f1f5f9" }}>Tenants</h1>
            <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
              {tenantList.length} tenant{tenantList.length !== 1 ? "s" : ""} · Admin only
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            + New Tenant
          </Button>
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tenantList.map(t => (
          <div
            key={t.id}
            className="rounded-xl p-5 flex flex-col gap-4"
            style={{
              background: "#0e1424",
              border: "1px solid rgba(255,255,255,0.07)",
              opacity: t.is_active ? 1 : 0.55,
            }}
          >
            {/* Name + status */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold" style={{ color: "#f1f5f9" }}>{t.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>/{t.slug}</p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                style={t.is_active
                  ? { background: "rgba(52,211,153,0.12)", color: "#34d399" }
                  : { background: "rgba(255,255,255,0.06)", color: "#64748b" }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.is_active ? "#34d399" : "#64748b" }} />
                {t.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs" style={{ color: "#64748b" }}>
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="5" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1 12c0-2.485 1.79-4.5 4-4.5s4 2.015 4 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M9 7a2 2 0 0 1 0 4M11.5 12c0-2-1.2-3.6-2.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {t.user_count} user{t.user_count !== 1 ? "s" : ""}
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6.5 4v3l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {formatDate(t.created_at, "—")}
              </div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />

            {/* Action */}
            <button
              onClick={() => handleToggleActive(t)}
              disabled={updatingId === t.id}
              className="w-full text-xs font-medium py-1.5 rounded-lg transition-colors"
              style={{
                background: t.is_active ? "rgba(239,68,68,0.08)" : "rgba(52,211,153,0.08)",
                color: t.is_active ? "#f87171" : "#34d399",
                border: `1px solid ${t.is_active ? "rgba(239,68,68,0.15)" : "rgba(52,211,153,0.15)"}`,
              }}
            >
              {updatingId === t.id ? "…" : t.is_active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}

        {tenantList.length === 0 && (
          <div className="col-span-3 flex items-center justify-center py-16 text-sm" style={{ color: "#64748b" }}>
            No tenants yet — create one to get started.
          </div>
        )}
      </div>

      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={t => setTenantList(prev => [...prev, t])}
      />
    </div>
  );
}

export default withAuthGuard(TenantsPage, { allowedRoles: ["admin"] });
