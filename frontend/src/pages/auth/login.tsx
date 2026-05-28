import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui";
import { Button, Card, Input } from "@/components/ui";
import { ApiError } from "@/services";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const registered = router.query.registered === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!email) errs.email = "Email is required";
    if (!password) errs.password = "Password is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      await login(email, password);
      // AuthGuard handles the pending-tenant gate — redirect to dashboard
      // and let it redirect to /auth/pending if no tenant is assigned yet
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
        {/* Logo / wordmark */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-text-heading tracking-tight">
            Neoflo
          </h1>
          <p className="text-sm text-text-caption mt-1">Invoice Processing Platform</p>
        </div>

        {/* Post-signup banner */}
        {registered && (
          <div
            className="mb-4 px-4 py-3 rounded-xl text-sm"
            style={{ background: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }}
          >
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
