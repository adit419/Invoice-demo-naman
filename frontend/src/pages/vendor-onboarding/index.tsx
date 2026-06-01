import { useEffect } from "react";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";

function VendorOnboardingIndex() {
  const router = useRouter();
  useEffect(() => { router.replace("/vendor-onboarding/portal"); }, [router]);
  return null;
}

export default withAuthGuard(VendorOnboardingIndex);
