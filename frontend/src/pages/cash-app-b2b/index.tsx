import Head from "next/head";
import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";

function CashAppB2B() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const hash = window.location.hash || "#/dashboard";
    if (iframeRef.current) {
      iframeRef.current.src = `/cash-app-b2b/index.html${hash}`;
    }
  }, [router.asPath]);

  return (
    <>
      <Head>
        <title>Cash App B2B</title>
      </Head>
      <iframe
        ref={iframeRef}
        src="/cash-app-b2b/index.html#/dashboard"
        style={{
          width: "100%",
          height: "100vh",
          border: "none",
          display: "block",
        }}
        title="Cash App B2B"
      />
    </>
  );
}

export default withAuthGuard(CashAppB2B);
