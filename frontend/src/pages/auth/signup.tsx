import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useToast } from "@/components/ui";
import { Button, Card, Input } from "@/components/ui";
import { ApiError, authService } from "@/services";

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!fullName.trim()) errs.fullName = "Name is required";
    if (!email) errs.email = "Email is required";
    if (password.length < 8) errs.password = "Password must be at least 8 characters";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      await authService.signup(fullName, email, password);
      // Account created — redirect to login with a pending-access notice
      router.push("/auth/login?registered=1");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Sign-up failed";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-text-heading tracking-tight">
            Neoflo
          </h1>
          <p className="text-sm text-text-caption mt-1">Invoice Processing Platform</p>
        </div>

        <Card surface="1" padding="lg" shadow>
          <h2 className="text-lg font-semibold text-text-heading mb-6">Create account</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Full name"
              type="text"
              placeholder="Adit Nag"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={errors.fullName}
              autoComplete="name"
              autoFocus
            />
            <Input
              label="Email address"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              autoComplete="new-password"
            />

            <Button type="submit" variant="primary" fullWidth loading={loading} className="mt-2">
              Create account
            </Button>
          </form>

          <p className="text-xs text-text-caption text-center mt-5">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-text-primary hover:text-text-primary-hover font-medium">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
