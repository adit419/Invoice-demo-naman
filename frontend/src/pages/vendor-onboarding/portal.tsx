import { withAuthGuard } from "@/components/AuthGuard";

// The iframe is preloaded in _app.tsx — this page is a transparent passthrough.
function VendorPortalPage() {
  return (
    <div style={{ height: "100vh", background: "transparent", position: "relative" }} />
  );
}

export default withAuthGuard(VendorPortalPage);
