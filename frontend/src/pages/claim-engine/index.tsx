import Head from "next/head";
import { useEffect, useRef } from "react";
import { useRouter } from "next/router";

export default function ClaimEngine() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // The host nav points at /claim-engine#/<section>. Reflect that hash into the
  // embedded SPA. If the iframe is already loaded, update its hash in place so
  // the app switches sections without a reload (keeps computed state).
  useEffect(() => {
    const hash = window.location.hash || "#/ingest";
    const ifr = iframeRef.current;
    if (!ifr) return;
    try {
      const win = ifr.contentWindow;
      if (win && win.location.pathname.startsWith("/claim-engine/")) {
        if (win.location.hash !== hash) win.location.hash = hash;
        return;
      }
    } catch {
      /* not loaded yet — fall through to (re)set src */
    }
    ifr.src = `/claim-engine/index.html?embed=1${hash}`;
  }, [router.asPath]);

  return (
    <>
      <Head>
        <title>Pricing & Claims</title>
      </Head>
      <iframe
        ref={iframeRef}
        src="/claim-engine/index.html?embed=1#/ingest"
        style={{
          width: "100%",
          height: "100vh",
          border: "none",
          display: "block",
        }}
        title="Pricing & Claims"
      />
    </>
  );
}
