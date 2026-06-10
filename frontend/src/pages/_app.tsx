import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useState } from "react";
import { ToastProvider } from "@/components/ui";
import { AuthProvider } from "@/context/AuthContext";
import { NavSidebar, PreviewBanner } from "@/components/NavSidebar";
import { FreightProvider } from "@/contexts/FreightContext";

const AUTH_ROUTES = ["/auth/login", "/auth/signup", "/auth/accept-invite"];
const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 64;

const AGENTIC_SRC       = "https://staging.alltius.ai/v2/widget.html?widgetId=6a284c3e0c6763ff6672eb67";
const VENDOR_PORTAL_SRC = "https://vendoronboarding.neoflo.ai/portal";
const VENDOR_ADMIN_SRC  = "https://vendoronboarding.neoflo.ai/admin";

function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const showSidebar = !AUTH_ROUTES.includes(router.pathname);
  const sidebarW = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  const isAgenticSearch   = router.pathname === "/agentic-search";
  const isVendorPortal    = router.pathname === "/vendor-onboarding/portal";
  const isVendorAdmin     = router.pathname === "/vendor-onboarding/admin";

  if (!showSidebar) return <>{children}</>;

  return (
    <>
      <style jsx global>{`
        :root {
          --sidebar-width: ${sidebarW}px;
        }
      `}</style>
      <NavSidebar collapsed={collapsed} onCollapse={setCollapsed} />

      {/* Preloaded KNO Store iframe — always mounted, shown only on /agentic-search */}
      <div
        style={{
          position: "fixed", top: 0, left: sidebarW, right: 0, bottom: 0,
          zIndex: isAgenticSearch ? 5 : -1,
          visibility: isAgenticSearch ? "visible" : "hidden",
          pointerEvents: isAgenticSearch ? "all" : "none",
          transition: "left 0.2s ease",
        }}
      >
        <iframe
          src={AGENTIC_SRC}
          style={{ display: "block", width: "100%", height: "100%", border: "none" }}
          allow="microphone; clipboard-write"
          title="KNO Store"
        />
      </div>

      {/* Preloaded Vendor Portal iframe */}
      <div
        style={{
          position: "fixed", top: 0, left: sidebarW, right: 0, bottom: 0,
          zIndex: isVendorPortal ? 5 : -1,
          visibility: isVendorPortal ? "visible" : "hidden",
          pointerEvents: isVendorPortal ? "all" : "none",
          transition: "left 0.2s ease",
        }}
      >
        <iframe
          src={VENDOR_PORTAL_SRC}
          style={{ display: "block", width: "100%", height: "100%", border: "none" }}
          allow="camera; microphone; clipboard-read; clipboard-write"
          title="Vendor Portal"
        />
      </div>

      {/* Preloaded Vendor Admin iframe */}
      <div
        style={{
          position: "fixed", top: 0, left: sidebarW, right: 0, bottom: 0,
          zIndex: isVendorAdmin ? 5 : -1,
          visibility: isVendorAdmin ? "visible" : "hidden",
          pointerEvents: isVendorAdmin ? "all" : "none",
          transition: "left 0.2s ease",
        }}
      >
        <iframe
          src={VENDOR_ADMIN_SRC}
          style={{ display: "block", width: "100%", height: "100%", border: "none" }}
          allow="camera; microphone; clipboard-read; clipboard-write"
          title="Admin Portal"
        />
      </div>

      <div
        style={{
          marginLeft: sidebarW,
          transition: "margin-left 0.2s ease",
          minHeight: "100vh",
        }}
      >
        <PreviewBanner />
        {children}
      </div>
    </>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ToastProvider>
      <AuthProvider>
        <FreightProvider>
          <AppShell>
            <Component {...pageProps} />
          </AppShell>
        </FreightProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
