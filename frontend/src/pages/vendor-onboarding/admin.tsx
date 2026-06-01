import { withAuthGuard } from "@/components/AuthGuard";

function AdminPortalPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <iframe
        src="https://vendoronboarding.neoflo.ai/admin"
        title="Admin Portal"
        allow="camera; microphone; clipboard-read; clipboard-write"
        style={{ flex: 1, width: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}

export default withAuthGuard(AdminPortalPage);
