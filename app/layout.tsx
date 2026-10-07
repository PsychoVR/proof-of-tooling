import type { Metadata } from "next";
import { connection } from "next/server";
import { Big_Shoulders, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { pageMetadata, SITE_NAME, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  ...pageMetadata({}),
};

// Self-hosted at build time: no request to Google at runtime, so the CSP needs no external font origins.
const display = Big_Shoulders({ subsets: ["latin"], weight: ["600", "800"], variable: "--ff-display", display: "swap" });
const body = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--ff-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--ff-mono", display: "swap" });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render every page per request so the CSP nonce set in proxy.ts can be applied to Next's scripts.
  await connection();
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main className="wrap" id="main">
          {children}
          <SiteFooter />
        </main>
      </body>
    </html>
  );
}
