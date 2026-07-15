// Minimal root layout for App Router (Finance OS section).
// The existing NavSidebar lives in the Pages Router _app.tsx — it does NOT
// apply here. Finance OS pages are accessed via the NavSidebar link which
// wraps this content area.
import type { Metadata } from "next"
import Script from "next/script"
import { Plus_Jakarta_Sans, Geist_Mono, Instrument_Sans } from "next/font/google"
import { ViewTransitions } from "next-view-transitions"
import { ThemeProvider } from "@/components/neoflo-os/theme-provider"
import { TooltipProvider } from "@/components/neoflo-os/ui/tooltip"
import { Toaster } from "@/components/neoflo-os/ui/sonner"
import { cn } from "@/lib/neoflo-os/utils"
import "@/styles/globals.css"

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const fontBrand = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-brand",
})

export const metadata: Metadata = {
  title: "Finance OS",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ViewTransitions>
      <html
        lang="en"
        suppressHydrationWarning
        className={cn("antialiased", fontMono.variable, "font-sans", fontSans.variable, fontBrand.variable)}
      >
        <body>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            <TooltipProvider delayDuration={150}>
              {children}
            </TooltipProvider>
            <Toaster richColors closeButton position="top-right" />
          </ThemeProvider>
          <Script id="alltius-sdk-loader" strategy="afterInteractive">
            {`(() => {const p=(l,s,a,i)=>{const n=()=>{if(!s.getElementById(a)){const e=s.getElementsByTagName(i)[0],t=s.createElement(i);t.type="text/javascript",t.async=!1,t.src="https://app.alltius.ai/alltiusSDK.js",t.id=a,e&&e.parentNode?e.parentNode.insertBefore(t,e):s.body.appendChild(t)}};if(!l.AlltiusSDK){const e=(...t)=>{e.q.push(t)};e.q=[],l.AlltiusSDK=e,s.readyState==="complete"?n():l.addEventListener("load",n)}};p(window,document,"alltius-sdk","script");})()`}
          </Script>
          <Script id="alltius-sdk-configure" strategy="afterInteractive">
            {`window.AlltiusSDK("configure", { metatadata: { widgetId: "6a56bccd8da4219afe65e48b" } });`}
          </Script>
        </body>
      </html>
    </ViewTransitions>
  )
}
