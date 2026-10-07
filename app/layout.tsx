import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Big_Shoulders, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";
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
  // The inline theme script needs the per-request CSP nonce that proxy.ts generated.
  const nonce = (await headers()).get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
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
