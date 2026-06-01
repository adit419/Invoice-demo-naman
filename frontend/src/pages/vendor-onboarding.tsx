import { withAuthGuard } from "@/components/AuthGuard";

function VendorOnboardingPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <iframe
        src="https://vendoronboarding.neoflo.ai"
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          display: "block",
        }}
        allow="camera; microphone; clipboard-read; clipboard-write"
        title="Vendor Onboarding"
      />
    </div>
  );
}

export default withAuthGuard(VendorOnboardingPage);
