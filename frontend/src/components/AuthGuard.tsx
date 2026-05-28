import { ComponentType, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/hooks/useAuth";
import { Role } from "@/context/AuthContext";
import { Spinner } from "@/components/ui";

interface AuthGuardOptions {
  allowedRoles?: Role[];
}

export function withAuthGuard<P extends object>(
  Component: ComponentType<P>,
  options: AuthGuardOptions = {}
): ComponentType<P> {
  const { allowedRoles } = options;

  function GuardedComponent(props: P) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (isLoading) return;
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      // Users without a tenant assignment can't access the app yet
      if (!user.tenant_id) {
        router.replace("/auth/pending");
        return;
      }
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        router.replace("/dashboard");
      }
    }, [user, isLoading, router]);

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-page">
          <Spinner size="lg" className="text-surface-primary" />
        </div>
      );
    }

    if (!user) return null;
    if (!user.tenant_id) return null;
    if (allowedRoles && !allowedRoles.includes(user.role)) return null;

    return <Component {...props} />;
  }

  GuardedComponent.displayName = `AuthGuard(${Component.displayName ?? Component.name})`;
  return GuardedComponent;
}
