import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useState } from "react";
import { ToastProvider } from "@/components/ui";
import { AuthProvider } from "@/context/AuthContext";
import { NavSidebar } from "@/components/NavSidebar";

const AUTH_ROUTES = ["/auth/login", "/auth/signup"];
const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 64;

function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const showSidebar = !AUTH_ROUTES.includes(router.pathname);
  const sidebarW = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  if (!showSidebar) return <>{children}</>;

  return (
    <>
      <NavSidebar collapsed={collapsed} onCollapse={setCollapsed} />
      <div
        style={{
          marginLeft: sidebarW,
          transition: "margin-left 0.2s ease",
          minHeight: "100vh",
        }}
      >
        {children}
      </div>
    </>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell>
          <Component {...pageProps} />
        </AppShell>
      </AuthProvider>
    </ToastProvider>
  );
}
