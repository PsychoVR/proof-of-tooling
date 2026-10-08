import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import localFont from "next/font/local";
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

// Font files live in the repository (assets/fonts, OFL): the build never reaches a font CDN.
// Next has no metrics for Big Shoulders, so it cannot derive a size-matched fallback (that warned at every build).
// Impact and Arial Narrow are condensed faces of similar width, which keeps the swap from shifting the layout.
const display = localFont({
  src: [{ path: "../assets/fonts/BigShoulders-800.woff2", weight: "800", style: "normal" }],
  variable: "--ff-display",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});
const body = localFont({
  src: [{ path: "../assets/fonts/HankenGrotesk-400.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/HankenGrotesk-500.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/HankenGrotesk-600.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/HankenGrotesk-700.woff2", weight: "700", style: "normal" }],
  variable: "--ff-body",
  display: "swap",
});
const mono = localFont({
  src: [{ path: "../assets/fonts/JetBrainsMono-400.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/JetBrainsMono-500.woff2", weight: "500", style: "normal" }],
  variable: "--ff-mono",
  display: "swap",
});

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
